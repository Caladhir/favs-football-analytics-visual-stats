# scraper/processors/team_processor.py
from __future__ import annotations
from typing import Any, Dict, List, Tuple

class TeamProcessor:
    """Vadi timove i igrače (iz lineups) u jednostavne upsert objekte."""

    def parse_teams(self, event: Dict[str, Any], enriched: Dict[str, Any]) -> List[Dict[str, Any]]:
        e = event
        teams = []

        def _one(side: str):
            t = (e.get(f"{side}Team") or {}) if isinstance(e.get(f"{side}Team"), dict) else {}
            sid = enriched.get(f"{side}_team_sofa") or t.get("id")
            if not sid:
                return None
            country = None
            if isinstance(t.get("country"), dict):
                country = t["country"].get("name")
            return {
                "sofascore_id": int(sid),
                "name": t.get("name") or t.get("shortName") or "",
                "short_name": t.get("shortName") or (t.get("name") or "")[:15],
                "country": country,
            }

        for side in ("home", "away"):
            row = _one(side)
            if row:
                teams.append(row)
        return teams

    def parse_players(self, enriched: Dict[str, Any]) -> List[Dict[str, Any]]:
        out: Dict[int, Dict[str, Any]] = {}
        lu = enriched.get("lineups") or {}
        for side in ("home", "away"):
            for p in lu.get(side, []) or []:
                pl = p.get("player") or {}
                pid = pl.get("id")
                if not pid:
                    continue
                out[int(pid)] = {
                    "sofascore_id": int(pid),
                    "full_name": pl.get("name"),
                    "number": p.get("jerseyNumber"),
                    "position": p.get("position"),
                }
        return list(out.values())

    def parse_lineups(self, enriched: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Parse player lineups for a single event.  When the `event_id` is
        missing on the enriched object, attempt to derive it from the
        embedded event or top‑level ID.  If no ID can be determined, no
        lineups are returned.  This makes the parser robust against
        upstream changes that omit `event_id` from the enriched payload.
        """
        out: List[Dict[str, Any]] = []
        # Determine the event identifier from multiple possible locations.
        raw_eid = enriched.get("event_id") or enriched.get("id")
        if raw_eid is None and isinstance(enriched.get("event"), dict):
            raw_eid = (enriched.get("event") or {}).get("id")
        try:
            event_id: Optional[int] = int(raw_eid) if raw_eid is not None else None
        except Exception:
            event_id = None
        if event_id is None:
            # Without a valid event_id we cannot relate lineups to a match;
            # return an empty list instead of raising an exception.
            return out
        source = "sofascore"
        lu = enriched.get("lineups") or {}
        # Determine team Sofascore IDs from enriched or fallback to event structure
        team_ids = {
            "home": enriched.get("home_team_sofa")
                     or ((enriched.get("event") or {}).get("homeTeam") or {}).get("id"),
            "away": enriched.get("away_team_sofa")
                     or ((enriched.get("event") or {}).get("awayTeam") or {}).get("id"),
        }
        for side in ("home", "away"):
            tid = team_ids.get(side)
            for p in (lu.get(side) or []):
                # Each lineup entry may be a dict with 'player' subobject or a flat dict.
                pl_obj = p.get("player") if isinstance(p, dict) else None
                player_id = None
                if pl_obj and pl_obj.get("id") is not None:
                    player_id = pl_obj.get("id")
                elif isinstance(p, dict) and p.get("id") is not None:
                    player_id = p.get("id")
                # Skip if no player identifier present
                if not player_id:
                    continue
                # Determine jersey number and position fields.  Some feeds use
                # jerseyNumber, others use shirtNumber or number.  Preserve
                # whatever numeric representation we can.
                jersey = None
                for key in ("jerseyNumber", "shirtNumber", "number"):
                    if isinstance(p.get(key), (int, str)):
                        jersey = p.get(key)
                        break
                pos = p.get("position") or (pl_obj.get("position") if pl_obj else None)
                out.append({
                    "source": source,
                    "source_event_id": event_id,
                    "team_sofascore_id": tid,
                    "player_sofascore_id": player_id,
                    "jersey_number": jersey,
                    "position": pos,
                    "is_starting": bool(p.get("isStarting") or p.get("starting")),
                    "is_captain": bool(p.get("isCaptain") or p.get("captain")),
                })
        return out

    def parse_formations(self, enriched: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Parse team formations for a single event.  When the `event_id` is
        missing on the enriched object, attempt to derive it from the
        embedded event or top‑level ID.  If no ID can be determined,
        return an empty list.
        """
        # Derive the event ID similarly to parse_lineups
        raw_eid = enriched.get("event_id") or enriched.get("id")
        if raw_eid is None and isinstance(enriched.get("event"), dict):
            raw_eid = (enriched.get("event") or {}).get("id")
        try:
            event_id: Optional[int] = int(raw_eid) if raw_eid is not None else None
        except Exception:
            event_id = None
        if event_id is None:
            return []
        source = "sofascore"
        out: List[Dict[str, Any]] = []
        # Attempt to find home and away team IDs via enriched or embedded event
        home_tid = enriched.get("home_team_sofa")
        away_tid = enriched.get("away_team_sofa")
        if home_tid is None and isinstance(enriched.get("event"), dict):
            home_tid = ((enriched.get("event") or {}).get("homeTeam") or {}).get("id")
        if away_tid is None and isinstance(enriched.get("event"), dict):
            away_tid = ((enriched.get("event") or {}).get("awayTeam") or {}).get("id")
        if enriched.get("homeFormation") and home_tid:
            out.append({
                "source": source,
                "source_event_id": event_id,
                "team_sofascore_id": int(home_tid),
                "formation": enriched.get("homeFormation"),
            })
        if enriched.get("awayFormation") and away_tid:
            out.append({
                "source": source,
                "source_event_id": event_id,
                "team_sofascore_id": int(away_tid),
                "formation": enriched.get("awayFormation"),
            })
        return out

team_processor = TeamProcessor()
