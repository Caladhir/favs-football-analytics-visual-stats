# scraper/scrapers/events_scraper.py - NEW: Match Events Scraper
from typing import List, Dict, Any, Optional
from .base_scraper import BaseScraper
from utils.logger import get_logger

logger = get_logger(__name__)

class MatchEventsScraper(BaseScraper):
    """Scraper for match events (goals, cards, substitutions, etc.)"""
    
    def __init__(self, browser_manager):
        super().__init__(browser_manager)
    
    def get_match_events(self, match_id: str) -> List[Dict[str, Any]]:
        """Get all events for a specific match"""
        try:
            endpoint = f"event/{match_id}/incidents"
            logger.info(f"Fetching events for match {match_id}")
            
            data = self.browser.fetch_data(endpoint)
            
            if not data or 'incidents' not in data:
                logger.warning(f"No events data for match {match_id}")
                return []
            
            incidents = data['incidents']
            processed_events = []
            
            for incident in incidents:
                processed_event = self._process_incident(incident, match_id)
                if processed_event:
                    processed_events.append(processed_event)
            
            logger.info(f"✅ Processed {len(processed_events)} events for match {match_id}")
            return processed_events
            
        except Exception as e:
            logger.error(f"Failed to fetch events for match {match_id}: {e}")
            return []
    
    def _process_incident(self, incident: Dict[str, Any], match_id: str) -> Optional[Dict[str, Any]]:
        """Process single match incident"""
        try:
            incident_type = incident.get('incidentType', '').lower()
            
            # Map SofaScore incident types to our event types
            event_type_mapping = {
                'goal': 'goal',
                'owngoal': 'own_goal', 
                'yellowcard': 'yellow_card',
                'redcard': 'red_card',
                'substitution': 'substitution',
                'penalty': 'penalty',
                'var': 'var',
                'corner': 'corner',
                'offside': 'offside'
            }
            
            mapped_type = event_type_mapping.get(incident_type)
            if not mapped_type:
                # Skip unsupported event types
                return None
            
            # Extract player information
            player_name = None
            if 'player' in incident:
                player_name = incident['player'].get('name')
            elif 'playerIn' in incident:  # For substitutions
                player_in = incident['playerIn'].get('name', '')
                player_out = incident.get('playerOut', {}).get('name', '')
                player_name = f"{player_in} ← {player_out}"
            
            # Determine team
            team_side = incident.get('isHome', True)
            team = 'home' if team_side else 'away'
            
            # Build event description
            description = self._build_event_description(incident, mapped_type)
            
            event_data = {
                'match_id': match_id,
                'minute': incident.get('time', 0),
                'event_type': mapped_type,
                'player_name': player_name,
                'team': team,
                'description': description,
                'incident_id': incident.get('id'),  # SofaScore incident ID
                'added_time': incident.get('addedTime'),
                'reason': incident.get('reason'),  # For cards
                'assist_player': incident.get('assist', {}).get('name') if 'assist' in incident else None,
            }
            
            return event_data
            
        except Exception as e:
            logger.warning(f"Failed to process incident: {e}")
            return None
    
    def _build_event_description(self, incident: Dict[str, Any], event_type: str) -> str:
        """Build human-readable description for event"""
        try:
            minute = incident.get('time', 0)
            added_time = incident.get('addedTime')
            
            time_str = f"{minute}'"
            if added_time:
                time_str = f"{minute}+{added_time}'"
            
            if event_type == 'goal':
                player = incident.get('player', {}).get('name', 'Unknown')
                assist = incident.get('assist', {}).get('name')
                if assist:
                    return f"⚽ Goal by {player} (assist: {assist}) - {time_str}"
                else:
                    return f"⚽ Goal by {player} - {time_str}"
            
            elif event_type == 'own_goal':
                player = incident.get('player', {}).get('name', 'Unknown')
                return f"⚽ Own goal by {player} - {time_str}"
            
            elif event_type == 'yellow_card':
                player = incident.get('player', {}).get('name', 'Unknown')
                reason = incident.get('reason', '')
                reason_str = f" ({reason})" if reason else ""
                return f"🟨 Yellow card for {player}{reason_str} - {time_str}"
            
            elif event_type == 'red_card':
                player = incident.get('player', {}).get('name', 'Unknown')
                reason = incident.get('reason', '')
                reason_str = f" ({reason})" if reason else ""
                return f"🟥 Red card for {player}{reason_str} - {time_str}"
            
            elif event_type == 'substitution':
                player_in = incident.get('playerIn', {}).get('name', 'Unknown')
                player_out = incident.get('playerOut', {}).get('name', 'Unknown')
                return f"🔄 Substitution: {player_in} ← {player_out} - {time_str}"
            
            elif event_type == 'penalty':
                player = incident.get('player', {}).get('name', 'Unknown')
                return f"🎯 Penalty by {player} - {time_str}"
            
            elif event_type == 'var':
                return f"📺 VAR Review - {time_str}"
            
            else:
                return f"{event_type.title()} - {time_str}"
                
        except Exception as e:
            logger.warning(f"Failed to build description: {e}")
            return f"{event_type} - {incident.get('time', 0)}'"
    
    def get_events_for_matches(self, match_ids: List[str]) -> List[Dict[str, Any]]:
        """Get events for multiple matches"""
        all_events = []
        
        for match_id in match_ids:
            try:
                events = self.get_match_events(match_id)
                all_events.extend(events)
            except Exception as e:
                logger.error(f"Failed to get events for match {match_id}: {e}")
                continue
        
        logger.info(f"✅ Total events fetched: {len(all_events)} for {len(match_ids)} matches")
        return all_events
    
    def scrape(self) -> List[Dict[str, Any]]:
        """This scraper doesn't have a standalone scrape method"""
        logger.warning("MatchEventsScraper.scrape() called - use get_match_events() instead")
        return []