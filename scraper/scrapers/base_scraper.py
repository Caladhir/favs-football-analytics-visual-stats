# scraper/scrapers/base_scraper.py
from abc import ABC, abstractmethod
from typing import List, Dict, Any
from utils.logger import get_logger

logger = get_logger(__name__)

class BaseScraper(ABC):
    """Base class for all scrapers"""
    
    def __init__(self, browser_manager=None):
        self.browser = browser_manager
        self.scraped_count = 0
        self.errors_count = 0
    
    @abstractmethod
    def scrape(self) -> List[Dict[str, Any]]:
        """Main scraping method - must be implemented by subclasses"""
        pass
    
    def _log_scrape_start(self, scraper_type: str):
        """Log start of scraping"""
        logger.info(f"Starting {scraper_type} scraping...")
    
    def _log_scrape_end(self, scraper_type: str, results: List[Dict[str, Any]]):
        """Log end of scraping"""
        self.scraped_count = len(results)
        logger.info(f" {scraper_type} completed: {self.scraped_count} items")
    
    def _handle_scraping_error(self, error: Exception, scraper_type: str):
        """Handle scraping errors"""
        self.errors_count += 1
        logger.error(f" {scraper_type} scraper error: {error}")
        
    def get_stats(self) -> Dict[str, int]:
        """Get scraping statistics"""
        return {
            'scraped': self.scraped_count,
            'errors': self.errors_count
        }