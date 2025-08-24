# scraper/processors/events_processor.py
from __future__ import annotations
from typing import Any, Dict, List, Optional
import re
from utils.logger import get_logger

logger = get_logger(__name__)

class EventsProcessor:
    """Parse SofaScore incidents into normalized match_events rows.

    Improvements vs. previous version:
        * Uses incidentType / incidentClass (SofaScore current schema) not just 'type'.
        * Proper minute derivation: time + addedTime (if small); avoids synthetic 1000+ minutes.
        * Richer event_type mapping (cards, goals, substitutions, VAR, injury, period filtered).
        * Better player name extraction (player / playerIn / playerOut fallback).
        * Description from reason / incidentClass / goalType.
    """

    _EVENT_TYPE_MAP = {
        # Goals
        "goal": "goal",
        "own_goal": "own_goal",
        # Cards
        "yellow": "yellow_card",
        "card": "yellow_card",  # default yellow unless class says red
        "red": "red_card",
        "secondyellow": "red_card",
        # Subs
        "substitution": "substitution",
        # VAR
        "vardecision": "var",
        "var": "var",
        # Other explicit
        "offside": "offside",
        "corner": "corner",
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
        raw_incidents = enriched.get("incidents") or enriched.get("events") or []
        unknown_min_samples: List[Dict[str, Any]] = []
        for idx, inc in enumerate(raw_incidents):
            raw_type = inc.get("incidentType") or inc.get("type") or inc.get("eventType") or ""
            raw_class = inc.get("incidentClass") or inc.get("class") or ""
            key = str(raw_type).lower().replace(" ","")
            etype = self._EVENT_TYPE_MAP.get(key, None)
            # Card refinement
            if key in ("card", "yellow", "red") or raw_type == "card":
                ckey = str(raw_class).lower()
                if "red" in ckey:
                    etype = "red_card"
                elif "yellow" in ckey:
                    etype = "yellow_card"
            if raw_type == "substitution":
                etype = "substitution"
            if raw_type.startswith("goal") or raw_type == "goal":
                etype = etype or "goal"
            if raw_type in ("varDecision", "var"):
                etype = "var"
            if not etype:
                # skip pure period / injuryTime noise
                noise = {"period", "injurytime"}
                if key in noise:
                    continue
                etype = "event"
            # Minute derivation
            minute = None
            base_min = inc.get("time")
            if base_min is not None:
                try:
                    minute = int(base_min)
                except Exception:
                    minute = None
            add = inc.get("addedTime") or inc.get("addMinutes") or inc.get("addedMinutes")
            try:
                if minute is not None and add is not None:
                    add_int = int(add)
                    # Ignore bogus 999 placeholders
                    if 0 < add_int < 30:
                        minute += add_int
            except Exception:
                pass
            if minute is None:
                # textual pattern (rare now)
                for k in ("text","clock"):
                    txt = inc.get(k)
                    if isinstance(txt,str):
                        m = re.search(r"(\d+)(?:\+(\d+))?", txt)
                        if m:
                            try:
                                minute = int(m.group(1)) + (int(m.group(2)) if m.group(2) else 0)
                                break
                            except Exception:
                                pass
            if minute is None:
                minute = -1
                if len(unknown_min_samples) < 5:
                    unknown_min_samples.append({"type": etype, "raw_type": raw_type, "keys": list(inc.keys())[:8]})
            # Player name
            pname = None
            # substitution: prefer playerIn, else player, else playerOut
            if raw_type == "substitution":
                for pk in ("playerIn","player","playerOut"):
                    pobj = inc.get(pk)
                    if isinstance(pobj, dict) and pobj.get("name"):
                        pname = pobj.get("name")
                        break
            else:
                pobj = inc.get("player") or {}
                pname = pobj.get("name") or inc.get("playerName")
            if not pname:
                pname = "Unknown"
            # Team side from isHome boolean
            team_side = None
            if isinstance(inc.get("isHome"), bool):
                team_side = "home" if inc.get("isHome") else "away"
            if not team_side:
                # fallback using player team ids if present
                tid2 = inc.get("teamId") or inc.get("team_id")
                if tid2 == home_tid:
                    team_side = "home"
                elif tid2 == away_tid:
                    team_side = "away"
            if not team_side:
                # If still unknown, skip (avoid polluting)
                continue
            # Assist (goal incidents may have assist1)
            assist_obj = inc.get("assist1") or inc.get("assist") or inc.get("secondaryPlayer") or {}
            assist_id = assist_obj.get("id") if isinstance(assist_obj, dict) else None
            primary_player_id = (inc.get("player") or {}).get("id") if isinstance(inc.get("player"), dict) else None
            in_id = (inc.get("playerIn") or {}).get("id") if isinstance(inc.get("playerIn"), dict) else None
            out_id = (inc.get("playerOut") or {}).get("id") if isinstance(inc.get("playerOut"), dict) else None
            # Description preference
            desc = inc.get("reason") or inc.get("text") or raw_class or raw_type
            rows.append({
                "source": "sofascore",
                "source_event_id": ev_id,
                "minute": minute,
                "event_type": etype,
                "team": team_side,
                "player_name": pname,
                "player_sofascore_id": primary_player_id,
                "assist_player_sofascore_id": assist_id,
                "player_in_sofascore_id": in_id,
                "player_out_sofascore_id": out_id,
                "description": desc,
            })
        # Log if we failed to resolve most minutes for this match
        if rows:
            unknown_cnt = sum(1 for r in rows if r.get("minute", -1) < 0)
            if unknown_cnt and unknown_cnt / len(rows) > 0.5:
                logger.info(
                    f"[events_processor] ev={ev_id} unknown_minutes={unknown_cnt}/{len(rows)} samples={unknown_min_samples}"
                )
            # If many -1 minutes, spread them deterministically to avoid all colliding (minute, event_type, team, player_name)
            # We no longer remap -1 minutes to 1000+; leave as -1 for clarity
        return rows

events_processor = EventsProcessor()
