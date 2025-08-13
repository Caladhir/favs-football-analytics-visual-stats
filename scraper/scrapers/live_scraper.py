# scraper/scrapers/live_scraper.py
from typing import List, Dict, Any
from .base_scraper import BaseScraper
from utils.logger import get_logger

logger = get_logger(__name__)

class LiveScraper(BaseScraper):
    def __init__(self, browser_manager):
        super().__init__(browser_manager)
        self.endpoint = "events/live"

    def scrape(self) -> List[Dict[str, Any]]:
        self._log_scrape_start("Live")
        try:
            logger.info(f"Fetching live matches from: {self.endpoint}")
            data = self.browser.fetch_data(self.endpoint)
            if not data or "events" not in data:
                logger.warning("No live events data received")
                return []
            events = data["events"] or []
            logger.info(f"Raw live events received: {len(events)}")
            self._log_scrape_end("Live", events)
            return events
        except Exception as e:
            self._handle_scraping_error(e, "Live")
            return []
