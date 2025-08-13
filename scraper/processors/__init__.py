# scraper/processors/__init__.py
from .status_processor import map_status
from .match_processor import process_events_with_teams, prepare_for_database
from .team_processor import build_team_records, get_team_uuid, store_teams

__all__ = [
    "map_status",
    "process_events_with_teams",
    "prepare_for_database",
    "build_team_records",
    "get_team_uuid",
    "store_teams",
]
