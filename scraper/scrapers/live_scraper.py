# scraper/scrapers/live_scraper.py
from typing import List, Dict, Any
from .base_scraper import BaseScraper
from utils.logger import get_logger

logger = get_logger(__name__)

class LiveScraper(BaseScraper):
    def __init__(self, browser_manager):
        super().__init__(browser_manager)
        # primarni + fallback rute (API se zna mijenjati)
        self.endpoints = [
            "events/live",
            "event/live",            # fallback
            "sport/football/events/live",  # fallback
        ]

    def scrape(self) -> List[Dict[str, Any]]:
        self._log_scrape_start("Live")
        try:
            data = None
            for ep in self.endpoints:
                logger.info(f"Fetching live matches from: {ep}")
                data = self._fetch(ep)
                if data:
                    break
            events = self._coerce_events_shape(data)
            logger.info(f"Raw live events received: {len(events)}")
            self._log_scrape_end("Live", events)
            return events
        except Exception as e:
            self._handle_scraping_error(e, "Live")
            return []
