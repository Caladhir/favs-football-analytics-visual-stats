# scraper/processors/competition_processor.py - COMPETITION HANDLING
from typing import Dict, Any, Optional
from core.config import config
from core.database import db
from utils.logger import get_logger

logger = get_logger(__name__)

class CompetitionProcessor:
    """Handles competition/tournament processing"""
    
    def __init__(self):
        self.updated_priorities = 0
    
    def update_all_competition_priorities(self) -> int:
        """Batch update competition priorities in database"""
        try:
            logger.info("Updating competition priorities...")
            
            # Get all existing competitions
            competitions = db.client.table("competitions").select("id", "name", "priority").execute()
            
            updated_count = 0
            for comp in competitions.data:
                current_priority = comp.get("priority", 0)
                calculated_priority = config.get_league_priority(comp["name"])
                
                # Update if our priority is better
                if calculated_priority > current_priority:
                    db.client.table("competitions").update({
                        "priority": calculated_priority
                    }).eq("id", comp["id"]).execute()
                    
                    logger.info(f"Updated {comp['name']}: {current_priority} -> {calculated_priority}")
                    updated_count += 1
            
            logger.info(f"Updated {updated_count} competition priorities")
            self.updated_priorities = updated_count
            return updated_count
            
        except Exception as e:
            logger.error(f"Failed to update priorities: {e}")
            return 0
    
    def get_priority_stats(self) -> Dict[str, int]:
        """Get statistics about competition priorities"""
        try:
            competitions = db.client.table("competitions").select("name", "priority").execute()
            
            stats = {
                'top_tier': 0,    # Priority > 80
                'mid_tier': 0,    # Priority 50-80
                'low_tier': 0,    # Priority < 50
                'total': len(competitions.data)
            }
            
            for comp in competitions.data:
                priority = comp.get("priority", 0)
                if priority > 80:
                    stats['top_tier'] += 1
                elif priority >= 50:
                    stats['mid_tier'] += 1
                else:
                    stats['low_tier'] += 1
            
            return stats
            
        except Exception as e:
            logger.error(f"Failed to get priority stats: {e}")
            return {}
