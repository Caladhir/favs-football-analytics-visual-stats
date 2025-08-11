# scraper/processors/match_processor.py - ISPRAVKA: JEDINSTVENI UUID-JEVI
import uuid
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional  
from .status_processor import StatusProcessor
from core.config import config
from core.database import db
from utils.logger import get_logger

logger = get_logger(__name__)

class MatchProcessor:
    """Processes raw SofaScore match data"""
    
    def __init__(self):
        self.status_processor = StatusProcessor()
        self.league_stats = {}
        self.processed_ids = set()  # 🔧 NOVO: Track processed IDs
    
    def _generate_stable_id(self, event: Dict[str, Any]) -> str:
        """🔧 NOVA FUNKCIJA: Generiraj stabilan jedinstveni UUID"""
        # Koristi SofaScore ID ako postoji
        sofascore_id = event.get("id")
        if sofascore_id:
            # UUID5 namespace za consistency - ovo će uvijek generirati isti UUID za isti SofaScore ID
            return str(uuid.uuid5(uuid.NAMESPACE_DNS, f"sofa_{sofascore_id}"))
        
        # Fallback: generiraj iz ključnih podataka
        home_team = event.get("homeTeam", {}).get("name", "")
        away_team = event.get("awayTeam", {}).get("name", "")
        start_timestamp = event.get("startTimestamp", 0)
        tournament_id = event.get("tournament", {}).get("id", "")
        
        # Stvori stabilan signature
        match_signature = f"{home_team}_{away_team}_{start_timestamp}_{tournament_id}"
        
        # UUID5 iz signature - uvijek isti UUID za iste podatke
        return str(uuid.uuid5(uuid.NAMESPACE_DNS, f"match_{match_signature}"))
    
    def process_events(self, events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Process SofaScore events to database format"""
        if not events:
            logger.warning("No events to process")
            return []
        
        logger.info(f"Processing {len(events)} events...")
        
        parsed = []
        now = datetime.now(timezone.utc)
        self.league_stats = {}
        self.processed_ids.clear()  # 🔧 Reset ID tracking
        
        # 🔧 NOVA PROVJERA: Analiziraj duplikate u input podacima
        event_ids = [event.get("id") for event in events if event.get("id")]
        if len(event_ids) != len(set(event_ids)):
            duplicates = len(event_ids) - len(set(event_ids))
            logger.warning(f"🚨 Input contains {duplicates} duplicate SofaScore IDs!")
        
        for i, event in enumerate(events):
            try:
                processed_match = self._process_single_event(event, now, index=i)
                if processed_match:
                    # 🔧 PROVJERA DUPLIKATA
                    match_id = processed_match.get("id")
                    if match_id in self.processed_ids:
                        logger.warning(f"🚨 Duplicate ID detected: {match_id} for {processed_match.get('home_team')} vs {processed_match.get('away_team')}")
                        # Generiraj novi ID s index sufixom
                        new_id = f"{match_id}_dup_{i}"
                        processed_match["id"] = new_id
                        logger.info(f"🔧 Generated new ID: {new_id}")
                    
                    self.processed_ids.add(processed_match["id"])
                    parsed.append(processed_match)
                    
            except Exception as e:
                logger.warning(f"Skipped event {i}: {e}")
        
        # Log statistics
        self._log_league_statistics(parsed)
        
        logger.info(f"Processed {len(parsed)} unique matches from {len(events)} events")
        
        # 🔧 FINALNA PROVJERA
        final_ids = [match["id"] for match in parsed]
        if len(final_ids) != len(set(final_ids)):
            remaining_duplicates = len(final_ids) - len(set(final_ids))
            logger.error(f"🚨 STILL HAVE {remaining_duplicates} DUPLICATE IDs AFTER PROCESSING!")
            
            # Debug: prikaži duplikate
            from collections import Counter
            id_counts = Counter(final_ids)
            duplicates = {k: v for k, v in id_counts.items() if v > 1}
            
            for dup_id, count in list(duplicates.items())[:5]:
                logger.error(f"  Duplicate ID {dup_id} appears {count} times")
        
        return parsed
    
    def _process_single_event(self, event: Dict[str, Any], now: datetime, index: int = 0) -> Optional[Dict[str, Any]]:
        """Process single event with enhanced ID generation"""
        timestamp = event.get("startTimestamp")
        if not timestamp:
            return None
        
        # 🔧 POBOLJŠANA ID GENERACIJA
        stable_id = self._generate_stable_id(event)
        
        start_time = datetime.fromtimestamp(timestamp, tz=timezone.utc)
        status_type = event.get("status", {}).get("type", "")
        
        mapped_status = self.status_processor.map_status(status_type, start_time, now)
        
        # Koristi ispravnu SofaScore minutu
        minute = self._extract_sofascore_minute(event, mapped_status, now)
        
        home_score = event.get("homeScore", {}).get("current")
        away_score = event.get("awayScore", {}).get("current")
        
        tournament = event.get("tournament", {})
        competition_id = db.get_or_create_competition(tournament)
        competition_name = tournament.get("name", "Unknown")
        
        self._update_league_stats(competition_name, mapped_status)
        
        match_data = {
            "id": stable_id,  # 🔧 Koristi stabilan ID
            "home_team": event["homeTeam"]["name"],
            "away_team": event["awayTeam"]["name"],
            "home_score": home_score,
            "away_score": away_score,
            "start_time": timestamp,
            "status": mapped_status,  
            "status_type": status_type,
            "competition": competition_name,
            "competition_id": competition_id,
            "season": tournament.get("season"),
            "round": event.get("roundInfo", {}).get("name"),
            "minute": minute,
            "home_color": event["homeTeam"].get("teamColors", {}).get("primary", "#222"),
            "away_color": event["awayTeam"].get("teamColors", {}).get("primary", "#222"),
            "current_period_start": event.get("time", {}).get("currentPeriodStartTimestamp"),
            "venue": event.get("venue", {}).get("name"),
            "source": "sofascore",
            "league_priority": config.get_league_priority(competition_name),
            "processing_index": index,  # 🔧 NOVO: Debug info
            "original_sofascore_id": event.get("id")  # 🔧 Store original ID for debugging
        }
        
        return match_data
    
    def _extract_sofascore_minute(self, event: Dict[str, Any], mapped_status: str, now: datetime) -> Optional[int]:
        """Ispravno izvlači minutu iz SofaScore time objekta"""
        
        # Samo za live utakmice
        if mapped_status not in ["live", "ht"]:
            return None
        
        # Za halftime, ne prikazuj minutu
        status_code = event.get("status", {}).get("code")
        if status_code == 31:  # Halftime
            return None  # Backend će vratiti None, frontend će prikazati "HT"
            
        time_data = event.get("time", {})
        if not time_data:
            logger.warning(f"No time data for {event.get('homeTeam', {}).get('name')} vs {event.get('awayTeam', {}).get('name')}")
            return self._calculate_fallback_minute_from_start(event.get("startTimestamp"), now, mapped_status)
        
        try:
            # Koristi currentPeriodStartTimestamp za kalkulaciju
            current_period_start = time_data.get("currentPeriodStartTimestamp")
            if not current_period_start:
                logger.warning(f"No currentPeriodStartTimestamp for match")
                return self._calculate_fallback_minute_from_start(event.get("startTimestamp"), now, mapped_status)
            
            # Kalkuliraj koliko je prošlo od početka trenutnog perioda
            current_period_start_dt = datetime.fromtimestamp(current_period_start, tz=timezone.utc)
            seconds_in_period = (now - current_period_start_dt).total_seconds()
            
            # Dodaj extra vrijeme ako postoji
            extra = time_data.get("extra", 0)
            total_seconds = seconds_in_period + extra
            
            # Odredi trenutni period prema initial/max vrijednostima
            initial = time_data.get("initial", 0)
            max_val = time_data.get("max", 2700)
            
            # Pravilna interpretacija perioda
            if initial == 0 and max_val == 2700:
                # Prvi period (1-45')
                minute = int(total_seconds // 60)
                minute = max(1, min(minute, 45))  # Ograniči na 1-45
                
            elif initial == 2700 and max_val == 5400:
                # Drugi period (46-90')
                minute = 45 + int(total_seconds // 60)
                minute = max(46, min(minute, 90))  # Ograniči na 46-90
                
            else:
                # Nepoznat period format - koristi fallback
                logger.warning(f"Unknown period format: initial={initial}, max={max_val}")
                return self._calculate_fallback_minute_from_start(event.get("startTimestamp"), now, mapped_status)
            
            return minute
            
        except Exception as e:
            logger.warning(f"Failed to extract SofaScore minute: {e}")
            return self._calculate_fallback_minute_from_start(event.get("startTimestamp"), now, mapped_status)
    
    def _calculate_fallback_minute_from_start(self, start_timestamp: int, now: datetime, 
                                              mapped_status: str) -> Optional[int]:
        """Fallback kalkulacija od početka utakmice"""
        
        if mapped_status == "ht":
            return None  # HT se prikazuje kao "HT", ne kao minuta
        
        if not start_timestamp:
            return None
            
        start_time = datetime.fromtimestamp(start_timestamp, tz=timezone.utc)
        minutes_elapsed = (now - start_time).total_seconds() / 60
        
        # Ograniči na razumne vrijednosti
        if minutes_elapsed < 0:
            return 1
        elif minutes_elapsed > 150:  # Prestara utakmica
            return 90
        elif minutes_elapsed <= 45:
            return max(1, int(minutes_elapsed))
        elif minutes_elapsed <= 60:  # Poluvrijeme/pauza
            return 45  # Tijekom pauze prikaži 45'
        elif minutes_elapsed <= 105:  # Drugi poluvrijeme
            return min(45 + int(minutes_elapsed - 60), 90)
        else:  # Produžeci
            return min(90 + int(minutes_elapsed - 105), 120)
    
    def _update_league_stats(self, competition_name: str, mapped_status: str):
        """Update league statistics"""
        if competition_name not in self.league_stats:
            self.league_stats[competition_name] = {
                'total': 0,
                'live': 0,
                'priority': config.get_league_priority(competition_name)
            }
        
        self.league_stats[competition_name]['total'] += 1
        if mapped_status in ['live', 'ht']:
            self.league_stats[competition_name]['live'] += 1
    
    def _log_league_statistics(self, parsed_matches: List[Dict[str, Any]]):
        """Log league statistics"""
        if not self.league_stats:
            return
        
        logger.info(f"Processed {len(parsed_matches)} matches across {len(self.league_stats)} competitions:")
        
        sorted_leagues = sorted(
            self.league_stats.items(), 
            key=lambda x: x[1]['priority'], 
            reverse=True
        )
        
        for league, stats in sorted_leagues[:15]:  
            live_indicator = f"🔴 {stats['live']} live" if stats['live'] > 0 else ""
            priority_indicator = "⭐" if stats['priority'] > 80 else ""
            logger.info(f"  {priority_indicator} {league} (P:{stats['priority']}): {stats['total']} matches {live_indicator}")
        
        if len(sorted_leagues) > 15:
            logger.info(f"  ... and {len(sorted_leagues) - 15} more leagues")
    
    def prepare_for_database(self, matches: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """🔧 POBOLJŠANO: Prepare matches for database insertion s deduplikacijom"""
        if not matches:
            return []
        
        logger.info(f"Preparing {len(matches)} matches for database...")
        
        db_ready_matches = []
        seen_ids = set()
        duplicate_count = 0
        
        for match in matches:
            # 🔧 FINALNA ID PROVJERA - generiraj novi UUID za duplikate
            match_id = match.get("id")
            if match_id in seen_ids:
                duplicate_count += 1
                # Generiraj novi UUID umjesto dodavanja sufiksa
                new_uuid = str(uuid.uuid4())
                logger.warning(f"🔧 ID collision resolved: {match_id} -> {new_uuid}")
                match_id = new_uuid
                match["id"] = match_id
            
            seen_ids.add(match_id)
            
            data = {
                "id": match_id,  # 🔧 Sada koristi valjani UUID
                "home_team": match["home_team"],
                "away_team": match["away_team"],
                "home_score": match["home_score"],
                "away_score": match["away_score"],
                "start_time": datetime.fromtimestamp(match["start_time"], timezone.utc).isoformat(),
                "status": match["status"],  
                "status_type": match["status_type"],
                "competition": match["competition"],
                "competition_id": match["competition_id"],
                "season": match.get("season"),
                "round": match.get("round"),
                "venue": match.get("venue"),
                "minute": match["minute"],
                "home_color": match["home_color"],
                "away_color": match["away_color"],
                "current_period_start": match.get("current_period_start"),
                "source": "sofascore",
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "league_priority": match["league_priority"]
            }
            
            # Ukloni None vrijednosti
            data = {k: v for k, v in data.items() if v is not None}
            db_ready_matches.append(data)
        
        if duplicate_count > 0:
            logger.warning(f"🔧 Resolved {duplicate_count} ID collisions during preparation")
        
        logger.info(f"✅ Prepared {len(db_ready_matches)} unique matches for database insertion")
        return db_ready_matches
    
    def debug_minute_calculations(self, parsed_matches: List[Dict[str, Any]]):
        """Debug helper for minute calculations"""
        logger.info("🐛 Checking SofaScore minute extraction for live matches:")
        now = datetime.now(timezone.utc)
        
        live_matches = [m for m in parsed_matches if m["status"] in ["live", "ht"]]  
        
        for match in live_matches[:10]:  
            start_time = datetime.fromtimestamp(match["start_time"], timezone.utc)
            minutes_from_start = (now - start_time).total_seconds() / 60
            
            logger.info(f"  🔴 {match['home_team']} vs {match['away_team']}")
            logger.info(f"    League: {match['competition']} (P:{match['league_priority']})")
            logger.info(f"    Started: {start_time.strftime('%H:%M')} ({minutes_from_start:.0f}m ago)")
            logger.info(f"    Status: {match['status_type']} -> {match['status']}")
            logger.info(f"    ID: {match['id']}")
            
            if match["minute"]:
                logger.info(f"    ✅ Minute: {match['minute']}' (SofaScore calculated)")
            else:
                logger.warning(f"    ❌ No minute data (likely halftime or error)")

# Stvaraj instancu
match_processor = MatchProcessor()