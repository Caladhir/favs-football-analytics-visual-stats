# scraper/scrapers/scheduled_scraper.py - SCHEDULED MATCHES SCRAPER
from typing import List, Dict, Any
from .base_scraper import BaseScraper
from processors import match_processor
from utils.logger import get_logger

logger = get_logger(__name__)

class ScheduledScraper(BaseScraper):
    """Scraper for scheduled football matches by date"""
    
    def __init__(self, browser_manager, date: str):
        super().__init__(browser_manager)
        self.date = date  
        self.endpoint = f"scheduled-events/{date}"  
    
    def scrape(self) -> List[Dict[str, Any]]:
        """Scrape scheduled matches for specific date"""
        self._log_scrape_start(f"Scheduled ({self.date})")
        
        try:
            logger.info(f"Fetching scheduled matches for {self.date}")
            
            data = self.browser.fetch_data(self.endpoint)
            
            if not data or 'events' not in data:
                logger.warning(f"No scheduled events data received for {self.date}")
                return []
            
            events = data['events']
            logger.info(f"Raw scheduled events received: {len(events)}")
            
            if not events:
                logger.info(f"No scheduled matches for {self.date}")
                return []
            
            processed_matches = match_processor.process_events(events)
            
            logger.info(f"Processed {len(processed_matches)} scheduled matches")
            
            self._log_scrape_end(f"Scheduled ({self.date})", processed_matches)
            return processed_matches
            
        except Exception as e:
            self._handle_scraping_error(e, f"Scheduled ({self.date})")
            return []