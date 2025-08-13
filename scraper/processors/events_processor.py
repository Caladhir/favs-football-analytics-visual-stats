# scraper/processors/events_processor.py - NEW: Events Processing
import uuid
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from core.database import db
from utils.logger import get_logger

logger = get_logger(__name__)

class EventsProcessor:
    """Processes match events for database storage"""
    
    def process_events(self, events_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Process events data for database insertion"""
        if not events_data:
            return []
        
        logger.info(f"Processing {len(events_data)} match events...")
        
        processed_events = []
        for event_data in events_data:
            try:
                processed_event = self._process_single_event(event_data)
                if processed_event:
                    processed_events.append(processed_event)
            except Exception as e:
                logger.warning(f"Failed to process event: {e}")
        
        logger.info(f"✅ Processed {len(processed_events)} events for database")
        return processed_events
    
    def _process_single_event(self, event_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Process single event for database"""
        # Generate deterministic UUID from match_id + incident_id + minute
        match_id = event_data.get('match_id')
        incident_id = event_data.get('incident_id', '')
        minute = event_data.get('minute', 0)
        
        event_signature = f"{match_id}_{incident_id}_{minute}_{event_data.get('event_type', '')}"
        event_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"event_{event_signature}"))
        
        db_event = {
            'id': event_uuid,
            'match_id': match_id,
            'minute': event_data.get('minute'),
            'event_type': event_data.get('event_type'),
            'player_name': event_data.get('player_name'),
            'team': event_data.get('team'),
            'description': event_data.get('description'),
            'incident_id': event_data.get('incident_id'),
            'added_time': event_data.get('added_time'),
            'reason': event_data.get('reason'),
            'assist_player': event_data.get('assist_player'),
            'created_at': datetime.now(timezone.utc).isoformat()
        }
        
        # Remove None values
        return {k: v for k, v in db_event.items() if v is not None}
    
    def store_events(self, events: List[Dict[str, Any]]) -> tuple[int, int]:
        """Store events in database with upsert"""
        if not events:
            return 0, 0
        
        try:
            logger.info(f"Storing {len(events)} match events...")
            
            # Batch upsert events
            result = db.client.table("match_events").upsert(
                events,
                on_conflict="id",
                count="exact"
            ).execute()
            
            success_count = len(events)
            logger.info(f"✅ Stored {success_count} events successfully")
            
            return success_count, 0
            
        except Exception as e:
            logger.error(f"Failed to store events: {e}")
            return 0, len(events)
    
    def clean_old_events(self, match_id: str) -> int:
        """Remove old events for a match (for live updates)"""
        try:
            result = db.client.table("match_events").delete().eq("match_id", match_id).execute()
            deleted_count = len(result.data) if result.data else 0
            logger.info(f"Cleaned {deleted_count} old events for match {match_id}")
            return deleted_count
        except Exception as e:
            logger.warning(f"Failed to clean old events for match {match_id}: {e}")
            return 0

# Global events processor instance
events_processor = EventsProcessor()