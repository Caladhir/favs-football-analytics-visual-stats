# scraper/processors/match_processor.py 
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
    
    def process_events(self, events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Process SofaScore events to database format"""
        if not events:
            logger.warning("No events to process")
            return []
        
        logger.info(f"Processing {len(events)} events...")
        
        parsed = []
        now = datetime.now(timezone.utc)
        self.league_stats = {}
        
        for event in events:
            try:
                processed_match = self._process_single_event(event, now)
                if processed_match:
                    parsed.append(processed_match)
                    
            except Exception as e:
                logger.warning(f"Skipped event: {e}")
        
        # Log statistics
        self._log_league_statistics(parsed)
        
        logger.info(f"Processed {len(parsed)} matches from {len(events)} events")
        return parsed
    
    def _process_single_event(self, event: Dict[str, Any], now: datetime) -> Optional[Dict[str, Any]]:
        """Process single event"""
        timestamp = event.get("startTimestamp")
        if not timestamp:
            return None
            
        start_time = datetime.fromtimestamp(timestamp, tz=timezone.utc)
        status_type = event.get("status", {}).get("type", "")
        
        mapped_status = self.status_processor.map_status(status_type, start_time, now)
        
        period_start = event.get("time", {}).get("currentPeriodStartTimestamp")
        period = event.get("time", {}).get("period", 0)
        minute = self.status_processor.calculate_minute(status_type, period_start, period, now, start_time)
        
        if mapped_status in ["finished", "canceled", "postponed", "abandoned"]:
            minute = None
        
        home_score = event.get("homeScore", {}).get("current")
        away_score = event.get("awayScore", {}).get("current")
        
        tournament = event.get("tournament", {})
        competition_id = db.get_or_create_competition(tournament)
        competition_name = tournament.get("name", "Unknown")
        
        self._update_league_stats(competition_name, mapped_status)
        
        match_data = {
            "id": event["id"],
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
            "current_period_start": period_start,
            "venue": event.get("venue", {}).get("name"),
            "source": "sofascore",
            "league_priority": config.get_league_priority(competition_name)
        }
        
        return match_data
    
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
        """Prepare matches for database insertion"""
        db_ready_matches = []
        
        for match in matches:
            data = {
                "id": str(uuid.uuid5(uuid.NAMESPACE_DNS, f"sofa_{match['id']}")),
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
            
            data = {k: v for k, v in data.items() if v is not None}
            db_ready_matches.append(data)
        
        logger.info(f"Prepared {len(db_ready_matches)} matches for database insertion")
        return db_ready_matches
    
    def debug_minute_calculations(self, parsed_matches: List[Dict[str, Any]]):
        """Debug helper for minute calculations"""
        logger.info("Checking minute calculations for live matches:")
        now = datetime.now(timezone.utc)
        
        live_matches = [m for m in parsed_matches if m["status"] in ["live", "ht"]]  
        
        for match in live_matches[:10]:  
            start_time = datetime.fromtimestamp(match["start_time"], timezone.utc)
            minutes_from_start = (now - start_time).total_seconds() / 60
            
            logger.info(f"  {match['home_team']} vs {match['away_team']}")
            logger.info(f"    League: {match['competition']} (P:{match['league_priority']})")
            logger.info(f"    Started: {start_time.strftime('%H:%M')} ({minutes_from_start:.0f}m ago)")
            logger.info(f"    Status: {match['status_type']} -> {match['status']}")
            logger.info(f"    Calculated minute: {match['minute']}'")
            
            if match["minute"] and match["minute"] > 100:
                logger.warning(f"    ⚠️ SUSPICIOUS: Minute {match['minute']}' for {minutes_from_start:.0f}m old match!")