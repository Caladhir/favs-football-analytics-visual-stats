# scraper/processors/__init__.py
"""
Processors module - handles data processing and transformation
"""

from .match_processor import MatchProcessor
from .status_processor import StatusProcessor
from .competition_processor import CompetitionProcessor

# Global processor instances
match_processor = MatchProcessor()
status_processor = StatusProcessor()
competition_processor = CompetitionProcessor()

# Export for easy importing
__all__ = [
    'MatchProcessor',
    'StatusProcessor', 
    'CompetitionProcessor',
    'match_processor',
    'status_processor',
    'competition_processor'
]