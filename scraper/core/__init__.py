# scraper/core/__init__.py
"""
Core module - contains essential infrastructure components
"""

from .config import config, Config
from .database import db, DatabaseClient
from .browser import BrowserManager, Browser

__all__ = [
    'config',
    'Config',
    'db', 
    'DatabaseClient',
    'BrowserManager',
    'Browser'
]