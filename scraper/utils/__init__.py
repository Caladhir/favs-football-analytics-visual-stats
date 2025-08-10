# scraper/utils/__init__.py
"""
Utils module - contains utility functions and helpers
"""

from .logger import get_logger, ScraperLogger
from .data_validator import validator, DataValidator

# Create global utility instances
scraper_logger = ScraperLogger()

__all__ = [
    'get_logger',
    'ScraperLogger',
    'scraper_logger',
    'validator',
    'DataValidator'
]