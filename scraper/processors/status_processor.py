# scraper/processors/status_processor.py - STATUS MAPPING & VALIDATION
import uuid
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional
from core.config import config
from utils.logger import get_logger

logger = get_logger(__name__)

class StatusProcessor:
    """Handles status mapping and validation"""
    
    @staticmethod
    def map_status(status_type: str, start_time: datetime, now: datetime = None) -> str:
        """Map SofaScore status to app status with time validation"""
        if now is None:
            now = datetime.now(timezone.utc)
        
        # Basic mapping
        mapped_status = config.STATUS_MAPPING.get(status_type, "upcoming")
        
        # Time validation for live matches
        time_since_start = now - start_time
        
        if mapped_status in ["live", "ht"] and time_since_start > timedelta(hours=config.ZOMBIE_HOUR_LIMIT):
            logger.warning(f"Zombie match detected - {time_since_start} since start")
            logger.warning(f"Forcing {status_type} -> finished for match at {start_time}")
            return "finished"
        
        # Check for future matches marked as live
        if start_time > now + timedelta(minutes=config.FUTURE_TOLERANCE_MINUTES) and mapped_status in ["live", "ht"]:
            logger.warning(f"Future match marked as live - forcing to upcoming")
            return "upcoming"
        
        return mapped_status
    
    @staticmethod
    def calculate_minute(status_type: str, period_start: Optional[int], period: int, 
                        now: datetime, start_time: datetime) -> Optional[int]:
        """Calculate current minute realistically"""
        
        # Only for live matches
        if status_type not in ["inprogress", "halftime"]:
            return None
        
        if not start_time:
            return None
            
        # Calculate minutes from match start
        minutes_from_start = int((now.timestamp() - start_time.timestamp()) // 60)
        
        # Safety checks
        if minutes_from_start < 0:
            return 1
        if minutes_from_start > 150:  # More than 2.5h - probably error
            logger.warning(f"Suspicious time calculation: {minutes_from_start}' - capping at 90")
            return 90
        
        # REALISTIC CALCULATION based on time from match start
        if minutes_from_start <= 45:
            # First half (1-45')
            calculated = max(1, minutes_from_start)
            return calculated
            
        elif minutes_from_start <= 60:
            # Halftime break (45-60')
            if status_type == "halftime":
                return 45  # Show 45' during halftime
            else:
                # Maybe first half extra time
                additional = min(minutes_from_start - 45, 5)  # Max +5 min
                calculated = 45 + additional
                return calculated
                
        elif minutes_from_start <= 105:
            # Second half (60-105' from start = 46'-90' match time)
            second_half_minute = 45 + (minutes_from_start - 60)
            calculated = min(second_half_minute, 90)
            return calculated
            
        else:
            # Extra time or overtime (105+')
            if minutes_from_start <= 120:
                overtime = 90 + (minutes_from_start - 105)
                calculated = min(overtime, 120)
                return calculated
            else:
                # Too late - probably should finish match
                logger.warning(f"Match too long ({minutes_from_start}') - should be finished")
                return 90