# scraper/processors/events_processor.py
from __future__ import annotations
from typing import Any, Dict, List, Optional

class EventsProcessor:
    """Convert incidents or enriched 'events' into rows for the match_events table.

    SofaScore exposes a variety of event types (e.g. 'penalty_goal',
    'substitution_in') that are not directly accepted by our database.  This
    processor normalises those values down to a small, allowed set.
    """

    # Mapping from raw event types to the DB‑accepted categories.  Any type
    # not found in this map will be stored under the generic category 'event'.
    _EVENT_TYPE_MAP = {
        "goal": "goal",
        "own_goal": "own_goal",
        "penalty": "penalty",
        "penalty_goal": "penalty",
        "penalty_miss": "penalty",
        "yellow_card": "yellow_card",
        "yellow": "yellow_card",
        "booking": "yellow_card",
        "booked": "yellow_card",
        "red_card": "red_card",
        "red": "red_card",
        "straight_red": "red_card",
        "second_yellow": "red_card",
        "substitution": "substitution",
        "substitution_in": "substitution",
        "substitution_out": "substitution",
        "sub": "substitution",
        "var": "var",
        "corner": "corner",
        "corner_kick": "corner",
        "offside": "offside",
        # Other temporal or generic events default to 'event'
        "kickoff": "event",
        "half_time": "event",
        "full_time": "event",
        "period_start": "event",
        "period_end": "event",
    }

    def parse(self, enriched: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Convert parsed incidents on an enriched event into rows for the
        `match_events` table.  If the enriched object does not include
        `event_id`, attempt to derive it from the top‑level ID or the
        embedded `event` object.  Without a valid identifier, events are
        skipped to avoid orphaned rows.
        """
        rows: List[Dict[str, Any]] = []
        # Determine event ID from multiple possible locations
        raw_eid = enriched.get("event_id") or enriched.get("id")
        if raw_eid is None and isinstance(enriched.get("event"), dict):
            raw_eid = (enriched.get("event") or {}).get("id")
        try:
            ev_id: Optional[int] = int(raw_eid) if raw_eid is not None else None
        except Exception:
            ev_id = None
        if ev_id is None:
            return rows
        for inc in enriched.get("events") or []:
            # Determine the canonical event_type.  Lower‑case, strip spaces and
            # underscores, then look up in the mapping.  Unknowns default to 'event'.
            raw_type = inc.get("type") or ""
            key = str(raw_type).strip().lower().replace(" ", "_").replace("__", "_")
            etype = self._EVENT_TYPE_MAP.get(key, "event")
            rows.append({
                "source": "sofascore",
                "source_event_id": ev_id,
                "minute": inc.get("minute"),
                "event_type": etype,
                "team": inc.get("team"),
                "player_name": inc.get("player_name"),
                "description": inc.get("description"),
            })
        return rows

events_processor = EventsProcessor()
