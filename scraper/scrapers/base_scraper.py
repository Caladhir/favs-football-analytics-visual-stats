# scraper/scrapers/base_scraper.py
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional, Union, Iterable
from utils.logger import get_logger

logger = get_logger(__name__)

class BaseScraper(ABC):
    """Base class for all scrapers with safe fetch + metrics."""

    def __init__(self, browser_manager=None):
        # može biti Browser() ili BrowserManager(); bitno je da ima fetch_data() ili get_json()
        self.browser = browser_manager
        self.scraped_count = 0
        self.errors_count = 0

    @abstractmethod
    def scrape(self) -> List[Dict[str, Any]]:
        """Main scraping method - must be implemented by subclasses"""
        raise NotImplementedError

    # ---------- logging ----------
    def _log_scrape_start(self, scraper_type: str):
        logger.info(f"Starting {scraper_type} scraping.")

    def _log_scrape_end(self, scraper_type: str, results: List[Dict[str, Any]]):
        self.scraped_count = len(results)
        logger.info(f"{scraper_type} completed: {self.scraped_count} items")

    def _handle_scraping_error(self, error: Exception, scraper_type: str):
        self.errors_count += 1
        logger.error(f"{scraper_type} scraper error: {error}")

    def get_stats(self) -> Dict[str, int]:
        return {"scraped": self.scraped_count, "errors": self.errors_count}

    # ---------- safe fetch ----------
    def _fetch(self, path: str) -> Optional[Union[Dict[str, Any], List[Any]]]:
        """Robusno dohvaćanje: radi i kad browser ima fetch_data() ili get_json()."""
        try:
            if not self.browser:
                raise RuntimeError("Browser is not initialized on this scraper.")
            if hasattr(self.browser, "fetch_data"):
                logger.info(f"[fetch] {path}")
                return self.browser.fetch_data(path)
            if hasattr(self.browser, "get_json"):
                logger.info(f"[fetch(get_json)] {path}")
                return self.browser.get_json(path)
            raise AttributeError("Browser has neither fetch_data nor get_json method.")
        except Exception as ex:
            logger.warning(f"[fetch] {path} failed: {ex}")
            return None

    @staticmethod
    def _coerce_events_shape(payload: Optional[Union[Dict[str, Any], List[Any]]]) -> List[Dict[str, Any]]:
        """Vrati listu eventova bez obzira je li response dict s 'events'/'matches' ili već lista."""
        if not payload:
            return []
        if isinstance(payload, list):
            return [x for x in payload if isinstance(x, dict)]
        if isinstance(payload, dict):
            for key in ("events", "matches", "items", "data"):
                val = payload.get(key)
                if isinstance(val, list):
                    return [x for x in val if isinstance(x, dict)]
        return []
