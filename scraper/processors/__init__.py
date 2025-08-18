# scraper/processors/__init__.py
"""
Lagani, povezani procesori za SofaScore scraper.
Svi procesori rade s 'enriched_event' strukturama iz fetch_loop.py:
{
  "event": { ...sofascore match... },
  "event_id": 123,
  "lineups": {"home":[...], "away":[...]},
  "homeFormation": "4-3-3",
  "awayFormation": "4-4-2",
  "events": [...],
  "_raw_statistics": {...},
  "_raw_player_stats": {...},
  "managers": {"home": {...}, "away": {...}},
  "home_team_sofa": 1,
  "away_team_sofa": 2
}
"""

from .status_processor import StatusProcessor, status_processor, normalize_status, clamp_to_db
from .team_processor import TeamProcessor, team_processor
from .competition_processor import CompetitionProcessor, competition_processor
from .events_processor import EventsProcessor, events_processor
from .stats_processor import StatsProcessor, stats_processor
from .match_processor import MatchProcessor

__all__ = [
    "StatusProcessor", "status_processor", "normalize_status", "clamp_to_db",
    "TeamProcessor", "team_processor",
    "CompetitionProcessor", "competition_processor",
    "EventsProcessor", "events_processor",
    "StatsProcessor", "stats_processor",
    "MatchProcessor",
]

# Back-compat helpers (ako ti netko zove stare funkcije)
def process_events_basic(enriched_events):
    return MatchProcessor().process(enriched_events)

def prepare_for_database(enriched_events):
    return MatchProcessor().process(enriched_events)
