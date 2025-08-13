from typing import List, Dict, Any
from .base_scraper import BaseScraper
from utils.logger import get_logger

logger = get_logger(__name__)

class ScheduledScraper(BaseScraper):
    def __init__(self, browser_manager, date: str):
        super().__init__(browser_manager)
        self.date = date
        self.endpoint = f"scheduled-events/{date}"

    def scrape(self) -> List[Dict[str, Any]]:
        self._log_scrape_start(f"Scheduled ({self.date})")
        try:
            logger.info(f"Fetching scheduled matches from: {self.endpoint}")
            data = self.browser.fetch_data(self.endpoint)
            if not data or "events" not in data:
                logger.warning(f"No scheduled events data received for {self.date}")
                return []
            events = data["events"] or []
            logger.info(f"Raw scheduled events received: {len(events)}")
            self._log_scrape_end(f"Scheduled ({self.date})", events)
            return events
        except Exception as e:
            self._handle_scraping_error(e, f"Scheduled ({self.date})")
            return []