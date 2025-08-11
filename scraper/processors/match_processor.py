# scraper/processors/match_processor.py - FIXED: SPRJEČAVA DUPLIKATE
import uuid
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional  
from .status_processor import StatusProcessor
from core.config import config
from core.database import db
from utils.logger import get_logger

logger = get_logger(__name__)

class MatchProcessor:
    """Processes raw SofaScore match data with DEDUPLICATION"""
    
    def __init__(self):
        self.status_processor = StatusProcessor()
        self.league_stats = {}
    
    def _generate_deterministic_id(self, event: Dict[str, Any]) -> str:
        """🔧 FIXED: Generiraj UVIJEK ISTI ID za isti događaj"""
        
        # 1. Koristi SofaScore ID ako postoji - ovo je najstabilniji identifikator
        sofascore_id = event.get("id")
        if sofascore_id:
            return str(uuid.uuid5(uuid.NAMESPACE_DNS, f"sofascore_{sofascore_id}"))
        
        # 2. Fallback: kreiraj iz ključnih podataka utakmice
        home_team = event.get("homeTeam", {}).get("name", "").strip()
        away_team = event.get("awayTeam", {}).get("name", "").strip()
        start_timestamp = event.get("startTimestamp", 0)
        tournament_name = event.get("tournament", {}).get("name", "").strip()
        
        # 3. Normiraj timestamp na sat (sprečava duplikate zbog malih promjena vremena)
        normalized_timestamp = start_timestamp // 3600 * 3600  # Round to hour
        
        # 4. Kreiraj stabilan signature
        match_signature = f"{home_team.lower()}|{away_team.lower()}|{normalized_timestamp}|{tournament_name.lower()}"
        
        # 5. UUID5 iz signature - UVIJEK isti za iste podatke
        return str(uuid.uuid5(uuid.NAMESPACE_DNS, f"match_{match_signature}"))
    
    def process_events(self, events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """🔧 FIXED: Process events with STRICT deduplication"""
        if not events:
            logger.warning("No events to process")
            return []
        
        logger.info(f"Processing {len(events)} events...")
        
        parsed = []
        now = datetime.now(timezone.utc)
        self.league_stats = {}
        
        # 🔧 CRITICAL: Track processed signatures to prevent duplicates
        processed_signatures = set()
        duplicate_count = 0
        
        for i, event in enumerate(events):
            try:
                # Generate stable ID first
                stable_id = self._generate_deterministic_id(event)
                
                # 🔧 CHECK: Da li smo već obradili ovaj događaj?
                if stable_id in processed_signatures:
                    duplicate_count += 1
                    logger.debug(f"Skipping duplicate event {i}: {event.get('homeTeam', {}).get('name')} vs {event.get('awayTeam', {}).get('name')}")
                    continue
                
                processed_signatures.add(stable_id)
                
                # Process event
                processed_match = self._process_single_event(event, now, stable_id)
                if processed_match:
                    parsed.append(processed_match)
                    
            except Exception as e:
                logger.warning(f"Skipped event {i}: {e}")
        
        # Log deduplication stats
        if duplicate_count > 0:
            logger.warning(f"🔧 Filtered out {duplicate_count} duplicate events")
        
        # Log league statistics
        self._log_league_statistics(parsed)
        
        logger.info(f"✅ Processed {len(parsed)} UNIQUE matches from {len(events)} events (removed {duplicate_count} duplicates)")
        return parsed
    
    def _process_single_event(self, event: Dict[str, Any], now: datetime, stable_id: str) -> Optional[Dict[str, Any]]:
        """Process single event with provided stable ID"""
        timestamp = event.get("startTimestamp")
        if not timestamp:
            return None
        
        start_time = datetime.fromtimestamp(timestamp, tz=timezone.utc)
        status_type = event.get("status", {}).get("type", "")
        
        mapped_status = self.status_processor.map_status(status_type, start_time, now)
        
        # Extract minute
        minute = self._extract_sofascore_minute(event, mapped_status, now)
        
        home_score = event.get("homeScore", {}).get("current")
        away_score = event.get("awayScore", {}).get("current")
        
        tournament = event.get("tournament", {})
        competition_id = db.get_or_create_competition(tournament)
        competition_name = tournament.get("name", "Unknown")
        
        self._update_league_stats(competition_name, mapped_status)
        
        match_data = {
            "id": stable_id,  # 🔧 Use deterministic ID
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
            "original_sofascore_id": event.get("id")  # Store for debugging
        }
        
        return match_data
    
    def _extract_sofascore_minute(self, event: Dict[str, Any], mapped_status: str, now: datetime) -> Optional[int]:
        """Extract minute from SofaScore time data"""
        
        # Only for live matches
        if mapped_status not in ["live", "ht"]:
            return None
        
        # For halftime, don't show minute
        status_code = event.get("status", {}).get("code")
        if status_code == 31:  # Halftime
            return None
            
        time_data = event.get("time", {})
        if not time_data:
            return self._calculate_fallback_minute_from_start(event.get("startTimestamp"), now, mapped_status)
        
        try:
            current_period_start = time_data.get("currentPeriodStartTimestamp")
            if not current_period_start:
                return self._calculate_fallback_minute_from_start(event.get("startTimestamp"), now, mapped_status)
            
            current_period_start_dt = datetime.fromtimestamp(current_period_start, tz=timezone.utc)
            seconds_in_period = (now - current_period_start_dt).total_seconds()
            
            extra = time_data.get("extra", 0)
            total_seconds = seconds_in_period + extra
            
            initial = time_data.get("initial", 0)
            max_val = time_data.get("max", 2700)
            
            if initial == 0 and max_val == 2700:
                # First half (1-45')
                minute = int(total_seconds // 60)
                minute = max(1, min(minute, 45))
                
            elif initial == 2700 and max_val == 5400:
                # Second half (46-90')
                minute = 45 + int(total_seconds // 60)
                minute = max(46, min(minute, 90))
                
            else:
                return self._calculate_fallback_minute_from_start(event.get("startTimestamp"), now, mapped_status)
            
            return minute
            
        except Exception as e:
            logger.warning(f"Failed to extract SofaScore minute: {e}")
            return self._calculate_fallback_minute_from_start(event.get("startTimestamp"), now, mapped_status)
    
    def _calculate_fallback_minute_from_start(self, start_timestamp: int, now: datetime, 
                                              mapped_status: str) -> Optional[int]:
        """Fallback minute calculation"""
        
        if mapped_status == "ht":
            return None
        
        if not start_timestamp:
            return None
            
        start_time = datetime.fromtimestamp(start_timestamp, tz=timezone.utc)
        minutes_elapsed = (now - start_time).total_seconds() / 60
        
        if minutes_elapsed < 0:
            return 1
        elif minutes_elapsed > 150:
            return 90
        elif minutes_elapsed <= 45:
            return max(1, int(minutes_elapsed))
        elif minutes_elapsed <= 60:
            return 45
        elif minutes_elapsed <= 105:
            return min(45 + int(minutes_elapsed - 60), 90)
        else:
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
        
        logger.info(f"Processed {len(parsed_matches)} unique matches across {len(self.league_stats)} competitions:")
        
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
        """Prepare matches for database insertion"""
        if not matches:
            return []
        
        logger.info(f"Preparing {len(matches)} matches for database...")
        
        db_ready_matches = []
        
        for match in matches:
            data = {
                "id": match["id"],  # Already deterministic
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
            
            # Remove None values
            data = {k: v for k, v in data.items() if v is not None}
            db_ready_matches.append(data)
        
        logger.info(f"✅ Prepared {len(db_ready_matches)} matches for database insertion")
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

# Create instance
match_processor = MatchProcessor()