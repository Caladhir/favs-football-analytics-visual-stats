# scraper/processors/team_processor.py
from __future__ import annotations
from typing import Any, Dict, List, Tuple, Optional

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
            # Ensure non-empty team name; DB has NOT NULL constraint on teams.name
            name_val = t.get("name") or t.get("shortName")
            if not (isinstance(name_val, str) and name_val.strip()):
                try:
                    name_val = f"Team {int(sid)}"
                except Exception:
                    name_val = "Team"
            short_val = t.get("shortName") or (t.get("name") or "")[:15]
            return {
                "sofascore_id": int(sid),
                "name": name_val,
                "short_name": short_val,
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
        # Fallback: derive from raw lineups by inspecting team or players[].teamId
        if (home_tid is None or away_tid is None) and isinstance(enriched.get("_raw_lineups"), dict):
            raw = enriched.get("_raw_lineups") or {}
            if home_tid is None:
                h = raw.get("home") or {}
                home_tid = (h.get("team") or {}).get("id") or None
                if home_tid is None and isinstance(h.get("players"), list) and h.get("players"):
                    try:
                        home_tid = (h.get("players")[0].get("teamId") or h.get("players")[0].get("team", {}).get("id"))
                    except Exception:
                        home_tid = None
            if away_tid is None:
                a = raw.get("away") or {}
                away_tid = (a.get("team") or {}).get("id") or None
                if away_tid is None and isinstance(a.get("players"), list) and a.get("players"):
                    try:
                        away_tid = (a.get("players")[0].get("teamId") or a.get("players")[0].get("team", {}).get("id"))
                    except Exception:
                        away_tid = None
        home_form = enriched.get("homeFormation")
        away_form = enriched.get("awayFormation")
        # Fallback: inspect raw lineups payload if formations weren't set
        if (not home_form or not away_form) and isinstance(enriched.get("_raw_lineups"), dict):
            raw = enriched.get("_raw_lineups") or {}
            # direct keys
            home_form = home_form or raw.get("homeFormation")
            away_form = away_form or raw.get("awayFormation")
            # nested list variant
            teams = raw.get("teams") or raw.get("lineups")
            if isinstance(teams, list):
                for t in teams:
                    try:
                        is_home = t.get("isHome")
                        form = t.get("formation") or (t.get("team") or {}).get("formation")
                        if is_home is True and not home_form:
                            home_form = form
                        elif is_home is False and not away_form:
                            away_form = form
                    except Exception:
                        continue
            # deep scan as last resort
            if (not home_form or not away_form):
                def _walk(obj):
                    if isinstance(obj, dict):
                        yield obj
                        for v in obj.values():
                            yield from _walk(v)
                    elif isinstance(obj, list):
                        for it in obj:
                            yield from _walk(it)
                for node in _walk(raw):
                    if not isinstance(node, dict):
                        continue
                    form = node.get("formation")
                    if not isinstance(form, str):
                        continue
                    # try infer side by isHome or by matching team.id
                    side = None
                    if node.get("isHome") is True:
                        side = "home"
                    elif node.get("isHome") is False:
                        side = "away"
                    else:
                        t = node.get("team") or {}
                        tid = t.get("id")
                        if tid is not None:
                            try:
                                tid = int(tid)
                            except Exception:
                                pass
                            if home_tid and tid == int(home_tid):
                                side = "home"
                            elif away_tid and tid == int(away_tid):
                                side = "away"
                    if side == "home" and not home_form:
                        home_form = form
                    elif side == "away" and not away_form:
                        away_form = form
        if home_form and home_tid:
            out.append({
                "source": source,
                "source_event_id": event_id,
                "team_sofascore_id": int(home_tid),
                "formation": home_form,
            })
        if away_form and away_tid:
            out.append({
                "source": source,
                "source_event_id": event_id,
                "team_sofascore_id": int(away_tid),
                "formation": away_form,
            })
        return out

team_processor = TeamProcessor()
