# scraper/processors/events_processor.py
from __future__ import annotations
from typing import Any, Dict, List, Optional
import re
from utils.logger import get_logger

logger = get_logger(__name__)

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
        base = enriched.get("event") or {}
        home_team_obj = base.get("homeTeam") or {}
        away_team_obj = base.get("awayTeam") or {}
        home_tid = home_team_obj.get("id")
        away_tid = away_team_obj.get("id")
        raw_incidents = enriched.get("events") or []
        unknown_min_samples: List[Dict[str, Any]] = []
        for idx, inc in enumerate(raw_incidents):
            # Determine the canonical event_type.  Lower‑case, strip spaces and
            # underscores, then look up in the mapping.  Unknowns default to 'event'.
            raw_type = inc.get("type") or ""
            key = str(raw_type).strip().lower().replace(" ", "_").replace("__", "_")
            etype = self._EVENT_TYPE_MAP.get(key, "event")
            # Minute fallback: if missing, default to -1 so we can persist the row
            # --- Minute extraction (robust) ---
            minute = None
            # direct fields
            for k in ("minute", "minutes", "timeMin", "timeMinute"):
                if inc.get(k) is not None:
                    try:
                        minute = int(inc.get(k))
                        break
                    except Exception:
                        pass
            # nested time object
            if minute is None:
                t = inc.get("time")
                if isinstance(t, dict):
                    for k in ("minute", "minutes", "regular", "current"):
                        if t.get(k) is not None:
                            try:
                                minute = int(t.get(k))
                                break
                            except Exception:
                                pass
                    # add stoppage/additional minutes
                    if minute is not None:
                        for add_k in ("addMinutes", "addedMinutes", "added", "stoppageTime", "injuryTime"):
                            add_v = t.get(add_k)
                            if add_v not in (None, ""):
                                try:
                                    minute += int(add_v)
                                except Exception:
                                    pass
            # textual pattern e.g. '45+2'
            if minute is None:
                for k in ("text", "clock", "timeText"):
                    txt = inc.get(k)
                    if isinstance(txt, str):
                        m = re.search(r"(\d+)(?:\+(\d+))?", txt)
                        if m:
                            try:
                                base = int(m.group(1))
                                extra = int(m.group(2)) if m.group(2) else 0
                                minute = base + extra
                                break
                            except Exception:
                                pass
            # fallback
            if minute is None:
                minute = -1
                if len(unknown_min_samples) < 5:
                    unknown_min_samples.append({"type": etype, "raw_type": raw_type, "keys": list(inc.keys())[:8]})
            # Player name fallback: try alternative fields, else a safe placeholder
            pname = inc.get("player_name")
            if not pname:
                # sometimes raw incident may include nested objects or alternative keys
                p = inc.get("player") or {}
                pname = p.get("name") or inc.get("playerName") or "Unknown"
            # Team side inference: Sofascore incidents are inconsistent.
            team_side = inc.get("team")
            if not team_side:
                # isHome boolean
                if isinstance(inc.get("isHome"), bool):
                    team_side = "home" if inc.get("isHome") else "away"
                else:
                    # team object with id
                    t_obj = inc.get("team")
                    if isinstance(t_obj, dict):
                        tid = t_obj.get("id")
                        if tid == home_tid:
                            team_side = "home"
                        elif tid == away_tid:
                            team_side = "away"
                    # explicit teamId / team_id
                    if not team_side:
                        tid2 = inc.get("teamId") or inc.get("team_id")
                        if tid2 == home_tid:
                            team_side = "home"
                        elif tid2 == away_tid:
                            team_side = "away"
            if not team_side:
                # Last resort: skip if absolutely no way to infer; log small sample.
                logger.debug(f"[events_processor] Skipping incident without team side ev={ev_id} type={etype} raw_keys={list(inc.keys())[:6]}")
                continue
            rows.append({
                "source": "sofascore",
                "source_event_id": ev_id,
                "minute": minute,
                "event_type": etype,
                "team": team_side,
                "player_name": pname,
                "description": inc.get("description"),
            })
        # Log if we failed to resolve most minutes for this match
        if rows:
            unknown_cnt = sum(1 for r in rows if r.get("minute", -1) < 0)
            if unknown_cnt and unknown_cnt / len(rows) > 0.5:
                logger.info(
                    f"[events_processor] ev={ev_id} unknown_minutes={unknown_cnt}/{len(rows)} samples={unknown_min_samples}"
                )
            # If many -1 minutes, spread them deterministically to avoid all colliding (minute, event_type, team, player_name)
            if unknown_cnt > 0:
                seq = 0
                for r in rows:
                    if r.get("minute", -1) < 0:
                        # Map to pseudo-minute bucket 1000+seq (unlikely to clash with real minutes <130)
                        r["minute"] = 1000 + seq
                        seq += 1
        return rows

events_processor = EventsProcessor()
