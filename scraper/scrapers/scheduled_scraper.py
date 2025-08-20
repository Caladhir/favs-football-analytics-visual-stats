from typing import List, Dict, Any
from .base_scraper import BaseScraper
from utils.logger import get_logger

logger = get_logger(__name__)

class ScheduledScraper(BaseScraper):
    def __init__(self, browser_manager, date: str):
        super().__init__(browser_manager)
        self.date = date
        # više mogućih ruta (SofaScore to svako malo rotira)
        self.endpoints = [
            f"scheduled-events/{date}",
            f"schedule/events/{date}",
            f"events/scheduled/{date}",
            f"sport/football/scheduled-events/{date}",
        ]

    def scrape(self) -> List[Dict[str, Any]]:
        self._log_scrape_start(f"Scheduled ({self.date})")
        try:
            data = None
            for ep in self.endpoints:
                logger.info(f"Fetching scheduled matches from: {ep}")
                data = self._fetch(ep)
                if data:
                    break
            events = self._coerce_events_shape(data)
            logger.info(f"Raw scheduled events received: {len(events)}")
            self._log_scrape_end(f"Scheduled ({self.date})", events)
            return events
        except Exception as e:
            self._handle_scraping_error(e, f"Scheduled ({self.date})")
            return []
