# scraper/processors/team_processor.py
from __future__ import annotations
from typing import Any, Dict, List, Tuple, Optional

class TeamProcessor:
    """Vadi timove i igrače (iz lineups) u jednostavne upsert objekte."""

    def parse_teams(self, event: Dict[str, Any], enriched: Dict[str, Any]) -> List[Dict[str, Any]]:
        e = event
        teams = []
    # NOTE: Očekuješ 2 * broj_utakmica timova. Ako vidiš manji broj (npr. 403 umjesto 406)
    # uzrok može biti: (1) event bez home/awayTeam strukture (posebni tip / otkazan),
    # (2) duplicat ID pa upsert normalizira (broj upisanih != broj procesiranih),
    # (3) parse fallback generirao 'Team <id>' ali id nije int -> preskočen. Ovdje držimo
    # fallback generiranje naziva i id parsiranje defenzivno.

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
            # Colors (fallback defaults to keep UI readable)
            colors = t.get("teamColors") or {}
            primary_color = colors.get("primary") or "#222222"
            secondary_color = colors.get("secondary") or "#FFFFFF"
            # Founded year (timestamp -> year) if available
            founded = None
            for key in ("foundationDateTimestamp", "founded", "foundation", "foundedYear"):
                val = t.get(key)
                if val:
                    try:
                        # If it's a large epoch (seconds) convert to year
                        if isinstance(val, (int, float)) and val > 10**8:
                            from datetime import datetime
                            founded = datetime.utcfromtimestamp(int(val)).year
                        else:
                            # naive parse: take first 4 digits, but validate below
                            founded = int(str(val)[:4])  # naive parse
                        break
                    except Exception:
                        founded = None

            # validate founded year (protect against values like -780, 0, or future years)
            try:
                from datetime import datetime as _dt
                if founded is not None:
                    if not (1800 <= int(founded) <= _dt.utcnow().year):
                        founded = None
            except Exception:
                founded = None
            # Venue details
            venue_name = None
            venue_capacity = None
            venue = t.get("venue") or {}
            if isinstance(venue, dict):
                venue_name = venue.get("name") or venue.get("stadiumName")
                venue_capacity = venue.get("capacity") or venue.get("stadiumCapacity")
            # Logo URL pattern
            logo_url = f"https://img.sofascore.com/api/v1/team/{sid}/image" if sid else None
            row = {
                "sofascore_id": int(sid),
                "name": name_val,
                "short_name": short_val,
                "country": country,
                "primary_color": primary_color,
                "secondary_color": secondary_color,
            }
            if founded:
                row["founded"] = founded
            if venue_name:
                row["venue"] = venue_name
            if venue_capacity:
                row["venue_capacity"] = venue_capacity
            if logo_url:
                row["logo_url"] = logo_url
            return row

        for side in ("home", "away"):
            row = _one(side)
            if row:
                teams.append(row)
        return teams

    def parse_players(self, enriched: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Extract distinct players with team_id and date_of_birth (year derivable downstream).

        - team_id: mapped from side (home/away) team sofascore id.
        - date_of_birth: raw YYYY-MM-DD string (DB cleaner will shrink to year).
        """
        out: Dict[int, Dict[str, Any]] = {}
        lu = enriched.get("lineups") or {}
        # Determine team ids for sides
        home_tid = enriched.get("home_team_sofa") or ((enriched.get("event") or {}).get("homeTeam") or {}).get("id")
        away_tid = enriched.get("away_team_sofa") or ((enriched.get("event") or {}).get("awayTeam") or {}).get("id")
        side_team_map = {"home": home_tid, "away": away_tid}
        for side in ("home", "away"):
            tid = side_team_map.get(side)
            for p in lu.get(side, []) or []:
                pl = p.get("player") or {}
                pid = pl.get("id")
                if not pid:
                    continue
                # Debug: if DOB ts present, mark in temp flag for logging (removed before return)
                dob_debug_flag = True if pl.get("dateOfBirthTimestamp") else False
                dob_str = None
                dob_ts = pl.get("dateOfBirthTimestamp") or pl.get("dateOfBirth")
                if dob_ts:
                    try:
                        val = int(dob_ts)
                        if val > 10**12:  # ms -> s
                            val //= 1000
                        from datetime import datetime, timezone, timedelta
                        epoch = datetime(1970, 1, 1, tzinfo=timezone.utc)
                        dob_dt = epoch + timedelta(seconds=val)
                        dob_str = dob_dt.date().isoformat()
                    except Exception:
                        dob_str = None
                # merge if existing (prefer earliest non-null fields)
                row = out.get(int(pid), {})
                row.update({
                    "sofascore_id": int(pid),
                    "full_name": row.get("full_name") or pl.get("name"),
                    "number": row.get("number") or p.get("jerseyNumber"),
                    "position": row.get("position") or p.get("position"),
                })
                if tid and row.get("team_sofascore_id") is None:
                    try:
                        row["team_sofascore_id"] = int(tid)
                    except Exception:
                        pass
                if dob_str and row.get("date_of_birth") is None:
                    row["date_of_birth"] = dob_str
                elif not dob_str and dob_ts and row.get("date_of_birth") is None and "dateOfBirthTimestamp" not in row:
                    # retain raw ts for fallback conversion in store.py (only if conversion failed)
                    try:
                        row["dateOfBirthTimestamp"] = int(dob_ts)
                    except Exception:
                        pass
                if dob_debug_flag:
                    row.setdefault("_dob_src", "stats_ts")
                out[int(pid)] = row
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
                    # Starting flag heuristics:
                    # 1. Direct flags isStarting / starting
                    # 2. Some payloads only mark substitutes (isSubstitute / substitute = True) -> then starter = not substitute
                    # 3. Presence of subbedInTime but not subbedOutTime usually means came on as sub (so not starter)
                    # 4. Explicit lineup arrays sometimes have "formationPlace" for starters; treat its presence as indicator.
                    "is_starting": bool(
                        p.get("isStarting")
                        or p.get("starting")
                        or (
                            (p.get("isSubstitute") is not True and p.get("substitute") is not True)
                            and not p.get("subbedInTime")  # not explicitly a sub coming on
                        )
                        or (p.get("formationPlace") not in (None, "") and not p.get("subbedInTime"))
                    ),
                    "is_captain": bool(p.get("isCaptain") or p.get("captain")),
                    # Pass through raw substitution timing markers for later minutes reconstruction downstream.
                    "_subbed_in_time": p.get("subbedInTime") or None,
                    "_subbed_out_time": p.get("subbedOutTime") or None,
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
