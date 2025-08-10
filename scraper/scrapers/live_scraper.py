# scraper/scrapers/live_scraper.py 
from typing import List, Dict, Any
from .base_scraper import BaseScraper
from processors import match_processor
from utils.logger import get_logger

logger = get_logger(__name__)

class LiveScraper(BaseScraper):
    """Scraper for live football matches"""
    
    def __init__(self, browser_manager):
        super().__init__(browser_manager)
        self.endpoint = "events/live"
    
    def scrape(self) -> List[Dict[str, Any]]:
        """Scrape live matches from SofaScore"""
        self._log_scrape_start("Live")
        
        try:
            logger.info(f"Fetching live matches from: {self.endpoint}")
            
            data = self.browser.fetch_data(self.endpoint)
            
            if not data or 'events' not in data:
                logger.warning("No live events data received")
                return []
            
            events = data['events']
            logger.info(f"Raw live events received: {len(events)}")
            
            if not events:
                logger.info("No live matches currently available")
                return []
            
            processed_matches = match_processor.process_events(events)
            
            live_matches = [
                match for match in processed_matches 
                if match.get('status') in ['live', 'ht']  
            ]
            
            logger.info(f"Filtered to {len(live_matches)} live matches")
            
            self._log_scrape_end("Live", live_matches)
            return live_matches
            
        except Exception as e:
            self._handle_scraping_error(e, "Live")
            return []