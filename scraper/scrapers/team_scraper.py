# scraper/scrapers/team_scraper.py - NEW: Teams and Enhanced Data
from typing import List, Dict, Any, Optional
from .base_scraper import BaseScraper
from utils.logger import get_logger

logger = get_logger(__name__)

class TeamScraper(BaseScraper):
    """Scraper for team data and enhanced match information"""
    
    def __init__(self, browser_manager):
        super().__init__(browser_manager)
        self.teams_cache = {}  # Cache team data to avoid repeated requests
    
    def get_team_details(self, team_id: int) -> Optional[Dict[str, Any]]:
        """Get detailed team information"""
        if team_id in self.teams_cache:
            return self.teams_cache[team_id]
        
        try:
            endpoint = f"team/{team_id}"
            data = self.browser.fetch_data(endpoint)
            
            if not data or 'team' not in data:
                logger.warning(f"No team data for ID {team_id}")
                return None
            
            team_data = data['team']
            processed_team = {
                'id': team_data.get('id'),
                'name': team_data.get('name', ''),
                'short_name': team_data.get('shortName', ''),
                'country': team_data.get('country', {}).get('name', ''),
                'logo_url': f"https://api.sofascore.app/api/v1/team/{team_id}/image",
                'primary_color': team_data.get('teamColors', {}).get('primary', '#000000'),
                'secondary_color': team_data.get('teamColors', {}).get('secondary', '#FFFFFF'),
                'founded': team_data.get('foundationDateTimestamp'),
                'venue': team_data.get('venue', {}).get('name'),
                'venue_capacity': team_data.get('venue', {}).get('capacity'),
            }
            
            # Cache the result
            self.teams_cache[team_id] = processed_team
            logger.info(f"✅ Fetched team: {processed_team['name']}")
            
            return processed_team
            
        except Exception as e:
            logger.error(f"Failed to fetch team {team_id}: {e}")
            return None
    
    def get_teams_from_matches(self, matches: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Extract and fetch team details from match data"""
        teams = []
        team_ids_seen = set()
        
        for match in matches:
            # Get team IDs from match data
            home_team_id = match.get('homeTeam', {}).get('id')
            away_team_id = match.get('awayTeam', {}).get('id')
            
            for team_id in [home_team_id, away_team_id]:
                if team_id and team_id not in team_ids_seen:
                    team_data = self.get_team_details(team_id)
                    if team_data:
                        teams.append(team_data)
                        team_ids_seen.add(team_id)
        
        logger.info(f"✅ Processed {len(teams)} unique teams")
        return teams
    
    def scrape(self) -> List[Dict[str, Any]]:
        """This scraper doesn't have a standalone scrape method"""
        logger.warning("TeamScraper.scrape() called - use get_teams_from_matches() instead")
        return []