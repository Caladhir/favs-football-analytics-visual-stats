# scraper/init_match_dataset.py - Bulk init dataset (2y back + 1y fwd) or custom range
from __future__ import annotations

import sys
import argparse
import time
import contextlib
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Tuple, Optional

# Put both project root and scraper/ on sys.path
THIS = Path(__file__).resolve()
SCRAPER_DIR = THIS.parents[1]          # ...\favs-app\scraper
PROJECT_ROOT = SCRAPER_DIR.parent      # ...\favs-app
if str(SCRAPER_DIR) not in sys.path:
    sys.path.insert(0, str(SCRAPER_DIR))
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from utils.logger import get_logger
from core.database import db
# Browser alias is usually exported as Browser, but be defensive:
try:
    from core.browser import Browser  # alias to BrowserManager
except Exception:
    from core.browser import BrowserManager as Browser
from processors.match_processor import MatchProcessor
from processors.stats_processor import parse_event_statistics
from processors.standings_processor import StandingsProcessor

logger = get_logger(__name__)

# Defaults
DAYS_BACK_DEFAULT = 365 * 2
DAYS_FORWARD_DEFAULT = 365
BATCH_SIZE_DEFAULT = 250  # not strictly needed (we process day-by-day)

def daterange(start_date: datetime, end_date: datetime) -> List[datetime]:
    d = start_date
    out = []
    while d <= end_date:
        out.append(d)
        d += timedelta(days=1)
    return out

def fetch_day(browser: Any, day: datetime, throttle: float = 0.0) -> List[Dict[str, Any]]:
    """Fetch base scheduled events for a given day from SofaScore."""
    date_str = day.strftime("%Y-%m-%d")
    endpoint = f"scheduled-events/{date_str}"
    try:
        data = browser.fetch_data(endpoint) or {}
        if throttle > 0:
            time.sleep(throttle)
        events = data.get("events") or data.get("matches") or []
        logger.info(f"✓ {len(events)} utakmica na dan {date_str}")
        return events
    except Exception as e:
        logger.error(f"Failed to fetch {date_str}: {e}")
        return []

def enrich_event(browser: Any, event: Dict[str, Any], throttle: float = 0.0) -> Dict[str, Any]:
    """Fetch lineups, incidents and statistics for one event, returning an enriched object.

    Network failures are tolerated – missing parts simply yield fewer rows later.
    """
    eid = event.get("id")
    enriched: Dict[str, Any] = {"event": event, "event_id": eid}
    if not eid:
        return enriched

    # --- lineups ---
    try:
        lu = browser.fetch_data(f"event/{eid}/lineups") or {}
        if throttle > 0:
            time.sleep(throttle)
        # Normalise to {home: [...], away: [...]} lists of players
        home_block = lu.get("home") or {}
        away_block = lu.get("away") or {}
        enriched["lineups"] = {
            "home": (home_block.get("players") or []),
            "away": (away_block.get("players") or []),
        }
        # Attempt formations
        enriched["homeFormation"] = home_block.get("formation") or (home_block.get("team") or {}).get("formation")
        enriched["awayFormation"] = away_block.get("formation") or (away_block.get("team") or {}).get("formation")
        # Cache raw (for deeper fallback logic in processors)
        enriched["_raw_lineups"] = lu
    except Exception as e:
        logger.debug(f"Lineups fetch failed for {eid}: {e}")

    # --- incidents (events) ---
    try:
        inc = browser.fetch_data(f"event/{eid}/incidents") or []
        if throttle > 0:
            time.sleep(throttle)
        # Keep raw list; events_processor is resilient to varying keys
        if isinstance(inc, dict) and "incidents" in inc:
            inc = inc.get("incidents") or []
        if not isinstance(inc, list):
            inc = []
        enriched["events"] = inc
    except Exception as e:
        logger.debug(f"Incidents fetch failed for {eid}: {e}")

    # --- statistics ---
    try:
        stats = browser.fetch_data(f"event/{eid}/statistics") or {}
        if throttle > 0:
            time.sleep(throttle)
        enriched["statistics"] = stats
    except Exception as e:
        logger.debug(f"Statistics fetch failed for {eid}: {e}")

    # --- managers ---
    try:
        mgr = browser.fetch_data(f"event/{eid}/managers") or {}
        if throttle > 0:
            time.sleep(throttle)
        if isinstance(mgr, dict):
            enriched["managers"] = mgr
    except Exception as e:
        logger.debug(f"Managers fetch failed for {eid}: {e}")

    # --- shots (shotmap) ---
    try:
        shots = browser.fetch_data(f"event/{eid}/shotmap") or browser.fetch_data(f"event/{eid}/shots") or []
        if throttle > 0:
            time.sleep(throttle)
        enriched["_raw_shots"] = shots
    except Exception as e:
        logger.debug(f"Shots fetch failed for {eid}: {e}")

    # --- average positions ---
    try:
        ap = browser.fetch_data(f"event/{eid}/average-positions") or browser.fetch_data(f"event/{eid}/averagepositions") or {}
        if throttle > 0:
            time.sleep(throttle)
        enriched["_raw_avg_positions"] = ap
    except Exception as e:
        logger.debug(f"Avg positions fetch failed for {eid}: {e}")

    return enriched

def store_bundle(bundle: Dict[str, List[Dict[str, Any]]]) -> Dict[str, int]:
    """Store a processed bundle with proper FK mapping.

    Steps:
      1. Upsert competitions, teams, players first.
      2. Map sofascore IDs -> UUIDs.
      3. Prepare match rows with FK IDs and upsert matches.
      4. Map (source, source_event_id) -> match_id.
      5. Transform dependent tables (lineups, formations, events, stats) to use match_id / team_id / player_id.
    """
    counts: Dict[str, Tuple[int, int]] = {}
    try:
        # 1) base entities
        comps = bundle.get("competitions", [])
        if comps:
            counts["competitions"] = db.upsert_competitions(comps)
        teams = bundle.get("teams", [])
        if teams:
            counts["teams"] = db.upsert_teams(teams)

        # Build team map early so we can attach team_id to players before player upsert
        comp_map = db.get_competition_ids_by_sofa([c.get("sofascore_id") for c in comps]) if comps else {}
        team_map = db.get_team_ids_by_sofa([t.get("sofascore_id") for t in teams]) if teams else {}

        # Players: attach team_id if parser left team_sofascore_id
        players = []
        for p in bundle.get("players", []) or []:
            p2 = dict(p)
            tsid = p2.pop("team_sofascore_id", None)
            if tsid is not None and tsid in team_map and not p2.get("team_id"):
                p2["team_id"] = team_map.get(tsid)
            players.append(p2)
        if players:
            counts["players"] = db.upsert_players(players)
        # manager upserts after players so we can map team ids similarly
        managers = []
        for m in bundle.get("managers", []) or []:
            m2 = dict(m)
            tsid = m2.pop("team_sofascore_id", None)
            if tsid is not None and tsid in team_map and not m2.get("team_id"):
                m2["team_id"] = team_map.get(tsid)
            managers.append(m2)
        if managers:
            counts["managers"] = db.upsert_managers(managers)
        # 2) mapping (player map after upsert)
        player_map = db.get_player_ids_by_sofa([p.get("sofascore_id") for p in players]) if players else {}
        manager_map = db.get_manager_ids_by_sofa([m.get("sofascore_id") for m in managers]) if managers else {}

        # 3) matches with FK IDs
        match_rows = []
        for m in bundle.get("matches", []) or []:
            m2 = dict(m)  # shallow copy
            comp_sofa = m2.pop("competition_sofascore_id", None)
            if comp_sofa:
                m2["competition_id"] = comp_map.get(comp_sofa)
            home_sofa = m2.pop("home_team_sofascore_id", None)
            away_sofa = m2.pop("away_team_sofascore_id", None)
            if home_sofa:
                m2["home_team_id"] = team_map.get(home_sofa)
            if away_sofa:
                m2["away_team_id"] = team_map.get(away_sofa)
            match_rows.append(m2)
        if match_rows:
            counts["matches"] = db.batch_upsert_matches(match_rows)

        # 4) match id map
        match_map = db.get_match_ids_by_source_ids([("sofascore", m.get("source_event_id")) for m in match_rows]) if match_rows else {}
        # Reverse for convenience: source_event_id -> match_id
        se_to_mid = {sid: mid for ((_, sid), mid) in match_map.items()}

        # Helper to choose team_id by side for a specific match (using match row)
        side_team_cache: Dict[str, Dict[str, str]] = {}
        for m in match_rows:
            sid = m.get("source_event_id")
            if sid in se_to_mid:
                side_team_cache[str(sid)] = {
                    "home": m.get("home_team_id"),
                    "away": m.get("away_team_id"),
                }

        # 5a) lineups
        line_rows = []
        for r in bundle.get("lineups", []) or []:
            eid = r.get("source_event_id")
            mid = se_to_mid.get(eid)
            if not mid:
                continue
            team_id = None
            # map via team_sofascore_id if present
            ts = r.get("team_sofascore_id")
            if ts is not None:
                team_id = team_map.get(ts)
            player_id = None
            ps = r.get("player_sofascore_id")
            if ps is not None:
                player_id = player_map.get(ps)
            if not (mid and team_id and player_id):
                continue
            line_rows.append({
                "match_id": mid,
                "team_id": team_id,
                "player_id": player_id,
                "position": r.get("position"),
                "jersey_number": r.get("jersey_number"),
                "is_starting": r.get("is_starting"),
                "is_captain": r.get("is_captain"),
            })
        if line_rows:
            counts["lineups"] = db.upsert_lineups(line_rows)

        # 5b) formations
        form_rows = []
        for r in bundle.get("formations", []) or []:
            eid = r.get("source_event_id")
            mid = se_to_mid.get(eid)
            if not mid:
                continue
            ts = r.get("team_sofascore_id")
            team_id = team_map.get(ts) if ts is not None else None
            if not (mid and team_id):
                continue
            form_rows.append({"match_id": mid, "team_id": team_id, "formation": r.get("formation")})
        if form_rows:
            counts["formations"] = db.upsert_formations(form_rows)

        # (NEW) incidents -> match_events (previously missing, explains events=0)
        ev_rows = []
        raw_events = bundle.get("events", []) or []
        logger.debug(
            f"[events] raw bundle events count={len(raw_events)} sample_keys="
            f"{[list(e.keys())[:6] for e in raw_events[:2]]}"
        )
        for ev in raw_events:
            try:
                eid = ev.get("source_event_id") or ev.get("event_id") or ev.get("id") or ev.get("match_id")
                eid = ev.get("source_event_id") or eid
                if eid is None:
                    if ev.get("event_id") is not None:
                        eid = ev.get("event_id")
                    else:
                        continue
                mid = se_to_mid.get(eid)
                if not mid:
                    continue
                minute = None
                tblock = ev.get("time")
                if isinstance(tblock, dict):
                    for k in ("minute", "minutes", "regular", "current"):
                        if tblock.get(k) is not None:
                            try:
                                minute = int(tblock.get(k))
                                break
                            except Exception:
                                pass
                    if minute is not None:
                        for addk in ("added", "addMinutes", "addedMinutes", "stoppageTime", "injuryTime"):
                            if tblock.get(addk) not in (None, ""):
                                try:
                                    minute += int(tblock.get(addk))
                                except Exception:
                                    pass
                if minute is None and ev.get("minute") is not None:
                    try:
                        minute = int(ev.get("minute"))
                    except Exception:
                        minute = None
                if minute is None:
                    txt = ev.get("text") or ev.get("clock") or ev.get("timeText")
                    if isinstance(txt, str):
                        import re as _re
                        m = _re.search(r"(\d+)(?:\+(\d+))?", txt)
                        if m:
                            try:
                                minute = int(m.group(1)) + (int(m.group(2)) if m.group(2) else 0)
                            except Exception:
                                pass
                if minute is None:
                    minute = -1
                event_type = (
                    ev.get("incidentType")
                    or ev.get("type")
                    or ev.get("event_type")
                    or ev.get("incident_type")
                )
                player_name = None
                pblock = ev.get("player") or {}
                if isinstance(pblock, dict):
                    player_name = (
                        pblock.get("name")
                        or pblock.get("shortName")
                        or pblock.get("slug")
                    )
                if not player_name:
                    player_name = ev.get("playerName") or ev.get("player_name")
                description = ev.get("text") or ev.get("description")
                team_side = ev.get("team") if isinstance(ev.get("team"), str) else None
                if not team_side and isinstance(ev.get("isHome"), bool):
                    team_side = "home" if ev.get("isHome") else "away"
                row = {
                    "match_id": mid,
                    "minute": minute,
                    "event_type": event_type,
                    "player_name": player_name,
                    "team": team_side,
                    "description": description,
                }
                if minute is None and not event_type and not player_name:
                    continue
                ev_rows.append(row)
            except Exception:
                continue
        if not ev_rows and raw_events:
            logger.debug(
                "[events] first-pass produced 0 rows; attempting fallback parse path"
            )
            try:
                from processors.events_processor import (
                    events_processor as _proc,
                )
                for ev in raw_events:
                    rows = _proc.parse(ev)
                    for r in rows:
                        sid = r.get("source_event_id")
                        mid = se_to_mid.get(sid)
                        if not mid:
                            continue
                        r["match_id"] = mid
                        ev_rows.append(r)
            except Exception as _ex:
                logger.debug(f"[events] fallback parse failed: {_ex}")
        if ev_rows:
            logger.debug(
                f"[events] mapped rows={len(ev_rows)} sample={ev_rows[:2]}"
            )
            counts["events"] = db.upsert_match_events(ev_rows)
            logger.debug(
                f"[events] built={len(ev_rows)} from_raw={len(raw_events)}"
            )
        else:
            if raw_events:
                logger.debug(
                    f"[events] none mapped raw={len(raw_events)} (possible key mismatch)"
                )

        # shots transform (enhanced mapping similar to legacy script)
        raw_shots_rows = bundle.get("shots", []) or []
        shot_rows: list[dict[str, Any]] = []
        drop_mid = drop_player = drop_minute = drop_xy = drop_outcome = 0
        derived_minute = 0
        for r in raw_shots_rows:
            try:
                eid = r.get("source_event_id")
                mid = se_to_mid.get(eid)
                if not mid:
                    drop_mid += 1; continue
                # player id may be flat or nested
                player_src = r.get("player_sofascore_id")
                if player_src is None:
                    p_obj = r.get("player") or {}
                    if isinstance(p_obj, dict):
                        player_src = p_obj.get("id")
                player_id = player_map.get(player_src) if player_src is not None else None
                if not player_id:
                    drop_player += 1; continue
                # minute derivation (explicit, nested time block, integer 'time', fallback sentinel)
                minute = r.get("minute")
                if minute is None:
                    t_block = r.get("time")
                    if isinstance(t_block, dict) and t_block.get("minute") is not None:
                        minute = t_block.get("minute"); derived_minute += 1
                    elif isinstance(t_block, int):
                        minute = t_block; derived_minute += 1
                    else:
                        minute = -1; drop_minute += 1  # sentinel, don't skip row
                # second derivation
                second_val = r.get("second")
                if second_val is None:
                    ts = r.get("timeSeconds")
                    if isinstance(ts, (int, float)):
                        second_val = int(ts % 60)
                # coordinates (flat or nested coordinates dict)
                x = r.get("x"); y = r.get("y")
                if x is None or y is None:
                    pc = r.get("playerCoordinates") or r.get("player_coordinates") or {}
                    if isinstance(pc, dict):
                        if x is None: x = pc.get("x")
                        if y is None: y = pc.get("y")
                if x is None or y is None:
                    drop_xy += 1; continue
                # outcome normalization (DB allowed: goal,on_target,off_target,blocked,saved,woodwork,saved_off_target)
                raw_out = (r.get("outcome") or r.get("shotType") or "")
                if isinstance(raw_out, str):
                    raw_key = raw_out.replace("-", "_").lower()
                else:
                    raw_key = ""
                # lazy init mapping dict once (store on function attribute to avoid redeclaring)
                if not hasattr(store_bundle, "_shot_outcome_map"):
                    store_bundle._shot_outcome_map = {
                        "goal": "goal",
                        "save": "saved",
                        "saved": "saved",
                        "miss": "off_target",
                        "off_target": "off_target",
                        "shot_off_target": "off_target",
                        "block": "blocked",
                        "blocked": "blocked",
                        "post": "woodwork",
                        "woodwork": "woodwork",
                        "bar": "woodwork",
                        "shot_on_target": "on_target",
                        "on_target": "on_target",
                        "on_target_saved": "saved",
                        "saved_off_target": "saved_off_target",
                    }
                outcome = store_bundle._shot_outcome_map.get(raw_key)
                if not outcome:
                    # heuristic fallbacks
                    if "goal" in raw_key:
                        outcome = "goal"
                    elif "save" in raw_key:
                        outcome = "saved"
                    elif "block" in raw_key:
                        outcome = "blocked"
                    elif "post" in raw_key or "bar" in raw_key:
                        outcome = "woodwork"
                    elif "miss" in raw_key or "off" in raw_key:
                        outcome = "off_target"
                if outcome not in {"goal","on_target","off_target","blocked","saved","woodwork","saved_off_target"}:
                    drop_outcome += 1; continue
                # derive penalty / own goal flags from goalType if not already set
                if r.get("goalType") and r.get("is_penalty") is None:
                    gt = str(r.get("goalType")).lower()
                    if "pen" in gt:
                        r["is_penalty"] = True
                if r.get("goalType") and r.get("is_own_goal") is None:
                    gt = str(r.get("goalType")).lower()
                    if "own" in gt:
                        r["is_own_goal"] = True
                assist_src = r.get("assist_player_sofascore_id")
                assist_id = player_map.get(assist_src) if assist_src is not None else None
                side = r.get("team")
                if side not in ("home", "away") and isinstance(r.get("isHome"), bool):
                    side = "home" if r.get("isHome") else "away"
                team_id = None
                if side in ("home", "away"):
                    team_id = (side_team_cache.get(str(eid)) or {}).get(side)
                shot_rows.append({
                    "match_id": mid,
                    "team_id": team_id,
                    "player_id": player_id,
                    "assist_player_id": assist_id,
                    "minute": minute,
                    "x": x,
                    "y": y,
                    "xg": r.get("xg"),
                    "body_part": r.get("body_part") or r.get("bodyPart"),
                    "situation": r.get("situation"),
                    "is_penalty": r.get("is_penalty"),
                    "is_own_goal": r.get("is_own_goal"),
                    "outcome": outcome,
                    "source": "sofascore",
                    "source_event_id": eid,
                    "source_item_id": r.get("source_item_id"),
                })
            except Exception:
                continue
        if shot_rows:
            logger.info(
                f"[shots] prepared rows={len(shot_rows)} raw={len(raw_shots_rows)} drops mid={drop_mid} player={drop_player} minute_dropped={drop_minute} minute_derived={derived_minute} xy={drop_xy} outcome={drop_outcome} sample_keys={list(shot_rows[0].keys()) if shot_rows else None}"
            )
            counts["shots"] = db.upsert_shots(shot_rows)
        else:
            if raw_shots_rows:
                sample = []
                for s in raw_shots_rows[:5]:
                    sample.append({
                        "minute": s.get("minute"),
                        "time_block": s.get("time"),
                        "x": s.get("x"),
                        "y": s.get("y"),
                        "has_xy": (s.get("x") is not None and s.get("y") is not None),
                        "player_sofa": s.get("player_sofascore_id"),
                        "event_id": s.get("source_event_id"),
                        "outcome": s.get("outcome"),
                        "raw_keys": list(s.keys()),
                    })
                logger.debug(f"[shots][debug sample] first5={sample}")
                logger.warning(
                    f"[shots] first pass zero mapped raw={len(raw_shots_rows)} mid={drop_mid} player={drop_player} minute={drop_minute} xy={drop_xy} outcome={drop_outcome}"
                )
                # optional: second pass if player mapping likely improved later (>=60% player drops)
                if drop_player > 0 and (drop_player >= (len(raw_shots_rows) * 0.6)):
                    logger.info("[shots] second-pass attempt (player_id mapping)")
                    player_map_second = db.get_player_ids_by_sofa([p.get("sofascore_id") for p in players]) if players else {}
                    shot_rows2 = []
                    drop_player2 = 0
                    for r in raw_shots_rows:
                        try:
                            eid = r.get("source_event_id")
                            mid = se_to_mid.get(eid)
                            if not mid:
                                continue
                            player_src = r.get("player_sofascore_id")
                            player_id = player_map_second.get(player_src) if player_src is not None else None
                            if not player_id:
                                drop_player2 += 1; continue
                            minute = r.get("minute") or -1
                            x = r.get("x"); y = r.get("y")
                            if x is None or y is None:
                                continue
                            raw_out = (r.get("outcome") or r.get("shotType") or "")
                            if isinstance(raw_out, str):
                                raw_key = raw_out.replace("-", "_").lower()
                            else:
                                raw_key = ""
                            outcome = store_bundle._shot_outcome_map.get(raw_key)
                            if not outcome:
                                if "goal" in raw_key:
                                    outcome = "goal"
                                elif "save" in raw_key:
                                    outcome = "saved"
                                elif "block" in raw_key:
                                    outcome = "blocked"
                                elif "post" in raw_key or "bar" in raw_key:
                                    outcome = "woodwork"
                                elif "miss" in raw_key or "off" in raw_key:
                                    outcome = "off_target"
                            if outcome not in {"goal","on_target","off_target","blocked","saved","woodwork","saved_off_target"}:
                                continue
                            if r.get("goalType") and r.get("is_penalty") is None:
                                gt = str(r.get("goalType")).lower()
                                if "pen" in gt:
                                    r["is_penalty"] = True
                            if r.get("goalType") and r.get("is_own_goal") is None:
                                gt = str(r.get("goalType")).lower()
                                if "own" in gt:
                                    r["is_own_goal"] = True
                            assist_src = r.get("assist_player_sofascore_id")
                            assist_id = player_map_second.get(assist_src) if assist_src is not None else None
                            side = r.get("team")
                            team_id = None
                            if side in ("home", "away"):
                                team_id = (side_team_cache.get(str(eid)) or {}).get(side)
                            shot_rows2.append({
                                "match_id": mid,
                                "team_id": team_id,
                                "player_id": player_id,
                                "assist_player_id": assist_id,
                                "minute": minute,
                                "x": x,
                                "y": y,
                                "xg": r.get("xg"),
                                "body_part": r.get("body_part"),
                                "situation": r.get("situation"),
                                "is_penalty": r.get("is_penalty"),
                                "is_own_goal": r.get("is_own_goal"),
                                "outcome": outcome,
                                "source": "sofascore",
                                "source_event_id": eid,
                                "source_item_id": r.get("source_item_id"),
                            })
                        except Exception:
                            continue
                    if shot_rows2:
                        logger.info(f"[shots] second-pass mapped rows={len(shot_rows2)} (player_drops_second={drop_player2})")
                        counts["shots"] = db.upsert_shots(shot_rows2)
                    else:
                        logger.warning(f"[shots] second-pass failed rows player_drop_second={drop_player2}")
        ms_rows = []
        for r in bundle.get("match_stats", []) or []:
            eid = r.get("source_event_id")
            mid = se_to_mid.get(eid)
            if not mid:
                continue
            side = r.get("team")
            team_id = None
            if side in ("home", "away"):
                team_id = (side_team_cache.get(str(eid)) or {}).get(side)
            if not (mid and team_id):
                continue
            row = {k: v for k, v in r.items() if k in {"possession","shots_total","shots_on_target","corners","fouls","offsides","yellow_cards","red_cards","passes","pass_accuracy","xg","xa","saves"}}
            row.update({"match_id": mid, "team_id": team_id})
            ms_rows.append(row)
        if ms_rows:
            counts["match_stats"] = db.upsert_match_stats(ms_rows)

        # Shots diagnostic already performed earlier; ensure we haven't double-processed
        if "shots" in counts:
            logger.debug(f"[shots] early block saved={counts['shots']}")

    # 5e) player_stats (strip unsupported card columns proactively)
        ps_rows = []
        for r in bundle.get("player_stats", []) or []:
            eid = r.get("source_event_id")
            mid = se_to_mid.get(eid)
            if not mid:
                continue
            pid = r.get("player_sofascore_id")
            player_id = player_map.get(pid) if pid is not None else None
            side = r.get("team")
            team_id = None
            if side in ("home", "away"):
                team_id = (side_team_cache.get(str(eid)) or {}).get(side)
            if not (mid and player_id):
                continue
            row = {k: v for k, v in r.items() if k in {"goals","assists","shots","passes","tackles","rating","minutes_played","is_substitute","was_subbed_in","was_subbed_out"}}
            row.update({"match_id": mid, "player_id": player_id, "team_id": team_id})
            ps_rows.append(row)
        if ps_rows:
            counts["player_stats"] = db.upsert_player_stats(ps_rows)

    # 5f) standings (competition/team seasonal table)
        st_rows = []
        for r in bundle.get("standings", []) or []:
            comp_sofa = r.get("competition_sofascore_id")
            team_sofa = r.get("team_sofascore_id")
            comp_id = comp_map.get(comp_sofa) if comp_sofa is not None else None
            team_id = team_map.get(team_sofa) if team_sofa is not None else None
            if not (comp_id and team_id):
                continue
            st_rows.append({
                "competition_id": comp_id,
                "season": r.get("season"),
                "team_id": team_id,
                "rank": r.get("rank"),
                "played": r.get("played"),
                "wins": r.get("wins"),
                "draws": r.get("draws"),
                "losses": r.get("losses"),
                "goals_for": r.get("goals_for"),
                "goals_against": r.get("goals_against"),
                "points": r.get("points"),
                "form": r.get("form"),
            })
        if st_rows:
            counts["standings"] = db.upsert_standings(st_rows)

        # 5g) match_managers (needs match + manager + team ids)
        mm_rows = []
        for r in bundle.get("match_managers", []) or []:
            eid = r.get("source_event_id")
            mid = se_to_mid.get(eid)
            if not mid:
                continue
            mgr_sofa = r.get("manager_sofascore_id")
            mgr_id = manager_map.get(mgr_sofa) if mgr_sofa is not None else None
            tsid = r.get("team_sofascore_id")
            team_id = team_map.get(tsid) if tsid is not None else None
            if mgr_id:
                mm_rows.append({
                    "match_id": mid,
                    "manager_id": mgr_id,
                    "team_id": team_id,
                    "side": r.get("side")
                })
        if mm_rows:
            counts["match_managers"] = db.upsert_match_managers(mm_rows)

    # (Removed duplicate shots processing block)

        # 5i) average_positions
        ap_rows = []
        dropped_ap_no_mid = dropped_ap_no_player = dropped_ap_no_xy = 0
        for r in bundle.get("average_positions", []) or []:
            eid = r.get("source_event_id")
            mid = se_to_mid.get(eid)
            if not mid:
                dropped_ap_no_mid += 1; continue
            pid_src = r.get("player_sofascore_id")
            player_id = player_map.get(pid_src) if pid_src is not None else None
            if not player_id:
                dropped_ap_no_player += 1; continue
            x = r.get("avg_x")
            y = r.get("avg_y")
            if x is None or y is None:
                dropped_ap_no_xy += 1; continue
            tsid = r.get("team_sofascore_id")
            team_id = team_map.get(tsid) if tsid is not None else None
            ap_rows.append({
                "match_id": mid,
                "player_id": player_id,
                "team_id": team_id,
                "avg_x": x,
                "avg_y": y,
                "touches": r.get("touches"),
                "minutes_played": r.get("minutes_played"),
            })
        if ap_rows:
            counts["average_positions"] = db.upsert_average_positions(ap_rows)
            # presence counters
            ap_touch_present = sum(1 for r in ap_rows if r.get("touches") is not None)
            ap_minutes_present = sum(1 for r in ap_rows if r.get("minutes_played") is not None)
            if dropped_ap_no_mid or dropped_ap_no_player or dropped_ap_no_xy:
                logger.debug(
                    f"[average_positions] kept={len(ap_rows)} drop_no_mid={dropped_ap_no_mid} drop_no_player={dropped_ap_no_player} "
                    f"drop_no_xy={dropped_ap_no_xy} touches_present={ap_touch_present}/{len(ap_rows)} minutes_present={ap_minutes_present}/{len(ap_rows)}"
                )
        else:
            if dropped_ap_no_mid or dropped_ap_no_player or dropped_ap_no_xy:
                logger.debug(f"[average_positions] all dropped no_mid={dropped_ap_no_mid} no_player={dropped_ap_no_player} no_xy={dropped_ap_no_xy}")

    except Exception as e:
        logger.error(f"Storage phase failed: {e}")

    # Convert (ok, fail) tuples to just ok counts for summary
    flat_counts = {k: (v[0] if isinstance(v, tuple) else v) for k, v in counts.items()}
    return flat_counts

try:
    from tqdm import tqdm  # type: ignore
except Exception:  # pragma: no cover
    tqdm = None  # fallback if tqdm not installed

def run(start: datetime, end: datetime, dry_run: bool, throttle: float = 0.0, show_progress: bool = True) -> None:
    logger.info(f"📅 Dump range: {start.date()} → {end.date()} (dry_run={dry_run}, throttle={throttle}s)")

    browser = Browser()
    processor = MatchProcessor()

    total_days = 0
    total_events = 0
    total_saved = {k: 0 for k in [
        "competitions","teams","players","managers","matches","lineups",
        "formations","events","player_stats","match_stats","shots","average_positions","standings","match_managers"
    ]}

    standings_processor = StandingsProcessor()
    fetched_standings_keys: set[tuple[int, str]] = set()  # (competition_sofa, season_str)
    negative_standings_paths: set[str] = set()  # cache 404/invalid variants this run
    expected_days = (end.date() - start.date()).days + 1

    def _fetch_standings(browser: Any, comp_sofa: int, season_id: int | None) -> Tuple[Any, str | None]:
        """Try a wide set of SofaScore standings endpoint variants.

        Returns (payload, path_used). If none succeed returns (None, None).
        We try more specific -> more generic ordering.
        """
        # Simple per (comp,season_id) negative counter to abort early if too many misses
        max_negative_variants = 6  # after this many distinct failed variants, abort
        neg_key = (comp_sofa, season_id or 0)
        # local cache on function attr (persist within run invocation)
        if not hasattr(_fetch_standings, "_neg_counts"):
            setattr(_fetch_standings, "_neg_counts", {})  # type: ignore[attr-defined]
        neg_counts: Dict[Tuple[int,int], int] = getattr(_fetch_standings, "_neg_counts")  # type: ignore[attr-defined]
        if neg_counts.get(neg_key, 0) >= max_negative_variants:
            logger.debug(f"[standings] early-abort comp={comp_sofa} season_id={season_id} (cached threshold)")
            return None, None
        variants: List[str] = []
        if season_id:
            variants += [
                # empirically most successful first (tournament path)
                f"tournament/{comp_sofa}/season/{season_id}/standings/total",
                f"unique-tournament/{comp_sofa}/season/{season_id}/standings/total",
                f"tournament/{comp_sofa}/season/{season_id}/standings",
                f"unique-tournament/{comp_sofa}/season/{season_id}/standings",
                f"tournament/{comp_sofa}/season/{season_id}/standings/overall",
                f"unique-tournament/{comp_sofa}/season/{season_id}/standings/overall",
                f"season/{season_id}/standings/total",
                f"season/{season_id}/standings",
            ]
        # fallback without explicit season id
        variants += [
            f"tournament/{comp_sofa}/standings/total",
            f"unique-tournament/{comp_sofa}/standings/total",
            f"tournament/{comp_sofa}/standings",
            f"unique-tournament/{comp_sofa}/standings",
            f"tournament/{comp_sofa}/standings/overall",
            f"unique-tournament/{comp_sofa}/standings/overall",
        ]

        negatives_this_call = 0
        for path in variants:
            if path in negative_standings_paths:
                logger.debug(f"[standings] skip cached-negative {path}")
                continue
            try:
                data = browser.fetch_data(path) or None
                if throttle > 0:
                    time.sleep(throttle)
                if not data:
                    negative_standings_paths.add(path)
                    negatives_this_call += 1
                    continue
                # Skip explicit error wrappers
                if isinstance(data, dict) and data.get("__error__"):
                    negative_standings_paths.add(path)
                    negatives_this_call += 1
                    continue
                # Heuristic: accept only if at least one typical standings key present
                if isinstance(data, dict) and not any(k in data for k in ("standings","overallStandings","tables","allStandings","rows","data","standingsData")):
                    negative_standings_paths.add(path)
                    negatives_this_call += 1
                    continue
                logger.debug(f"[standings] success path={path}")
                return data, path
            except Exception:
                negative_standings_paths.add(path)
                negatives_this_call += 1
                continue
            finally:
                if negatives_this_call and negatives_this_call % max_negative_variants == 0:
                    # update global counter and possibly abort further variants
                    neg_counts[neg_key] = neg_counts.get(neg_key, 0) + negatives_this_call
                    if neg_counts[neg_key] >= max_negative_variants:
                        logger.debug(f"[standings] threshold reached comp={comp_sofa} season_id={season_id} negatives={neg_counts[neg_key]}")
                        break
        # persist partial negatives
        if negatives_this_call:
            neg_counts[neg_key] = neg_counts.get(neg_key, 0) + negatives_this_call
        return None, None

    days_list = list(daterange(start, end))
    try:
        iterator = days_list
        use_bar = bool(show_progress and tqdm is not None and len(days_list) > 1)
        if use_bar:
            iterator = tqdm(days_list, desc="Days", unit="day")  # type: ignore
        for idx, day in enumerate(iterator, start=1):
            total_days += 1
            if not use_bar:
                logger.info(f"[progress] Day {idx}/{expected_days} → {day.strftime('%Y-%m-%d')}")
            events = fetch_day(browser, day, throttle=throttle)
            total_events += len(events)
            if not events:
                continue

            # Enrich events (lineups/incidents/statistics)
            enriched_events = []
            for ev in events:
                enriched_events.append(enrich_event(browser, ev, throttle=throttle))

            # Extract stats from enriched objects
            for enr in enriched_events:
                if enr.get("statistics"):
                    stats_out = parse_event_statistics(int(enr["event_id"]), enr.get("statistics"))
                    # Attach so MatchProcessor can ignore but we collect after
                    enr["_match_stats"] = stats_out.get("match_stats")
                    enr["_player_stats"] = stats_out.get("player_stats")

            # --- managers parse (simple) -> produce managers + match_managers temporary lists ---
            managers_all: List[Dict[str, Any]] = []
            match_managers_all: List[Dict[str, Any]] = []
            for enr in enriched_events:
                ev_id = enr.get("event_id")
                mgrs = enr.get("managers") or {}
                if not isinstance(mgrs, dict):
                    continue
                base = enr.get("event") or {}
                home_team_id = (base.get("homeTeam") or {}).get("id")
                away_team_id = (base.get("awayTeam") or {}).get("id")
                for side in ("home","away"):
                    m = mgrs.get(side) or mgrs.get(f"{side}Manager")
                    if isinstance(m, dict) and m.get("id"):
                        managers_all.append({
                            "sofascore_id": m.get("id"),
                            "full_name": m.get("name"),
                            "team_sofascore_id": home_team_id if side=="home" else away_team_id,
                        })
                        match_managers_all.append({
                            "source_event_id": ev_id,
                            "manager_sofascore_id": m.get("id"),
                            "team_sofascore_id": home_team_id if side=="home" else away_team_id,
                            "side": side,
                        })

            try:
                bundle = processor.process(enriched_events)
            except Exception as e:
                logger.error(f"Processing failed for {day.date()}: {e}")
                continue

            # Enrich competitions with extra fields (country, logo_url, priority if present)
            comp_extra: Dict[int, Dict[str, Any]] = {}
            for enr in enriched_events:
                base = enr.get("event") or {}
                tourn = base.get("tournament") or base.get("competition") or {}
                if not isinstance(tourn, dict):
                    continue
                tid = tourn.get("id")
                if not tid:
                    continue
                ce = comp_extra.setdefault(int(tid), {"sofascore_id": int(tid)})
                cat = tourn.get("category") or {}
                if isinstance(cat, dict) and cat.get("name"):
                    ce.setdefault("country", cat.get("name"))
                if tourn.get("priority") is not None:
                    ce.setdefault("priority", tourn.get("priority"))
                # Construct logo url
                ce.setdefault("logo_url", f"https://api.sofascore.app/api/v1/unique-tournament/{tid}/image")
            if comp_extra:
                base_list = bundle.get("competitions") or []
                idx_by_id = {c.get("sofascore_id"): c for c in base_list}
                for tid, extra in comp_extra.items():
                    target = idx_by_id.get(tid)
                    if target:
                        for k, v in extra.items():
                            if k not in target or target.get(k) in (None, ""):
                                target[k] = v
                    else:
                        base_list.append(extra)
                bundle["competitions"] = base_list

            # Enrich teams (colors, venue, founded, logo_url) if raw available
            team_extra: Dict[int, Dict[str, Any]] = {}
            for enr in enriched_events:
                base = enr.get("event") or {}
                for side in ("homeTeam","awayTeam"):
                    tobj = base.get(side) or {}
                    if not isinstance(tobj, dict):
                        continue
                    tid = tobj.get("id")
                    if not tid:
                        continue
                    te = team_extra.setdefault(int(tid), {"sofascore_id": int(tid)})
                    colors = tobj.get("teamColors") or {}
                    if isinstance(colors, dict):
                        if colors.get("primary"):
                            te.setdefault("primary_color", colors.get("primary"))
                        if colors.get("secondary"):
                            te.setdefault("secondary_color", colors.get("secondary"))
                    venue = tobj.get("venue") or {}
                    if isinstance(venue, dict):
                        if venue.get("name"):
                            te.setdefault("venue", venue.get("name"))
                        if venue.get("capacity"):
                            te.setdefault("venue_capacity", venue.get("capacity"))
                    if tobj.get("foundationDateTimestamp"):
                        te.setdefault("founded", tobj.get("foundationDateTimestamp"))
                    te.setdefault("logo_url", f"https://api.sofascore.app/api/v1/team/{tid}/image")
            if team_extra:
                base_list = bundle.get("teams") or []
                idx_by_id = {t.get("sofascore_id"): t for t in base_list}
                for tid, extra in team_extra.items():
                    target = idx_by_id.get(tid)
                    if target:
                        for k, v in extra.items():
                            if k not in target or target.get(k) in (None, ""):
                                target[k] = v
                    else:
                        base_list.append(extra)
                bundle["teams"] = base_list

            # Enrich players (nationality, height, age) from lineups raw
            player_extra: Dict[int, Dict[str, Any]] = {}
            for enr in enriched_events:
                lu = enr.get("lineups") or {}
                base = enr.get("event") or {}
                home_tid = (base.get("homeTeam") or {}).get("id")
                away_tid = (base.get("awayTeam") or {}).get("id")
                for side in ("home","away"):
                    plist = lu.get(side) or []
                    for p in plist:
                        pl = p.get("player") or {}
                        pid = pl.get("id")
                        if not pid:
                            continue
                        pe = player_extra.setdefault(int(pid), {"sofascore_id": int(pid)})
                        country = (pl.get("country") or {}).get("name") if isinstance(pl.get("country"), dict) else None
                        if country:
                            pe.setdefault("nationality", country)
                        if pl.get("height"):
                            pe.setdefault("height_cm", pl.get("height"))
                        if pl.get("age"):
                            pe.setdefault("age", pl.get("age"))
                        if side == "home" and home_tid:
                            pe.setdefault("team_sofascore_id", home_tid)
                        elif side == "away" and away_tid:
                            pe.setdefault("team_sofascore_id", away_tid)
            if player_extra:
                base_list = bundle.get("players") or []
                idx_by_id = {p.get("sofascore_id"): p for p in base_list}
                for pid, extra in player_extra.items():
                    target = idx_by_id.get(pid)
                    if target:
                        for k, v in extra.items():
                            if k not in target or target.get(k) in (None, ""):
                                target[k] = v
                    else:
                        base_list.append(extra)
                bundle["players"] = base_list

            # Merge stats extracted above into bundle
            match_stats_all = []
            player_stats_all = []
            for enr in enriched_events:
                match_stats_all.extend(enr.get("_match_stats") or [])
                player_stats_all.extend(enr.get("_player_stats") or [])
            if match_stats_all:
                bundle["match_stats"] = match_stats_all
            if player_stats_all:
                bundle["player_stats"] = player_stats_all
            # merge managers & match_managers
            if managers_all:
                bundle["managers"] = (bundle.get("managers") or []) + managers_all
            if match_managers_all:
                bundle["match_managers"] = (bundle.get("match_managers") or []) + match_managers_all
            # Fallback heuristic: derive minimal player_stats from lineups if none parsed
            if not bundle.get("player_stats"):
                derived = []
                for enr in enriched_events:
                    eid = enr.get("event_id")
                    if not eid:
                        continue
                    base = enr.get("event") or {}
                    lu = enr.get("lineups") or {}
                    for side in ("home","away"):
                        plist = lu.get(side) or []
                        for p in plist:
                            pl = p.get("player") or {}
                            pid = pl.get("id")
                            if not pid:
                                continue
                            is_start = bool(p.get("isStarting") or p.get("starting"))
                            rec = {
                                "source": "sofascore",
                                "source_event_id": int(eid),
                                "team": side,
                                "player_sofascore_id": pid,
                                "minutes_played": 90 if is_start else 15,
                                "is_substitute": (not is_start) or None,
                            }
                            derived.append(rec)
                if derived:
                    bundle["player_stats"] = derived

            # --- standings integration ---
            standings_rows: List[Dict[str, Any]] = []
            # --- shots parse (raw shotmap) ---
            shots_all: List[Dict[str, Any]] = []
            for enr in enriched_events:
                raw_shots = enr.get("_raw_shots")
                if not raw_shots:
                    continue
                # Normalise different shapes – expect list, but may get dict with list inside
                candidates = []
                if isinstance(raw_shots, list):
                    candidates = raw_shots
                elif isinstance(raw_shots, dict):
                    for key in ("shotmap", "shots", "items", "data", "events"):
                        val = raw_shots.get(key)
                        if isinstance(val, list) and val:
                            candidates = val
                            break
                    # Sometimes a single shot object
                    if not candidates and all(k in raw_shots for k in ("x", "y")):
                        candidates = [raw_shots]
                if not candidates:
                    continue
                base = enr.get("event") or {}
                home_tid = (base.get("homeTeam") or {}).get("id")
                away_tid = (base.get("awayTeam") or {}).get("id")
                # outcome normalization map
                _shot_out_map = {
                    "goal": "goal",
                    "save": "saved",
                    "saved": "saved",
                    "miss": "off_target",
                    "off_target": "off_target",
                    "shot_off_target": "off_target",
                    "block": "blocked",
                    "blocked": "blocked",
                    "post": "woodwork",
                    "woodwork": "woodwork",
                    "bar": "woodwork",
                    "shot_on_target": "on_target",
                    "on_target": "on_target",
                    "on_target_saved": "saved",
                    "saved_off_target": "saved_off_target",
                }
                for idx, s in enumerate(candidates):
                    if not isinstance(s, dict):
                        continue
                    try:
                        player = (s.get("player") or {}) if isinstance(s.get("player"), dict) else {}
                        assist = (s.get("assist") or {}) if isinstance(s.get("assist"), dict) else {}
                        tid = (s.get("team") or {}).get("id") if isinstance(s.get("team"), dict) else s.get("teamId")
                        side = "home" if tid and tid == home_tid else ("away" if tid and tid == away_tid else None)
                        if side is None and isinstance(s.get("isHome"), bool):
                            side = "home" if s.get("isHome") else "away"
                        # minute + second derivation
                        minute = s.get("minute")
                        if minute is None:
                            # shotmap often has integer 'time'
                            minute = s.get("time")
                        if isinstance(minute, dict):
                            minute = minute.get("minute")
                        time_seconds = s.get("timeSeconds")
                        # drop per-second precision
                        # coordinates: prefer playerCoordinates
                        x = s.get("x")
                        y = s.get("y")
                        if x is None or y is None:
                            pc = s.get("playerCoordinates") or {}
                            if isinstance(pc, dict):
                                if x is None:
                                    x = pc.get("x")
                                if y is None:
                                    y = pc.get("y")
                        if x is None or y is None:
                            pos = s.get("position") or {}
                            if isinstance(pos, dict):
                                if x is None:
                                    x = pos.get("x")
                                if y is None:
                                    y = pos.get("y")
                        # outcome normalization
                        raw_out = (s.get("shotType") or s.get("outcome") or s.get("shotResult") or "")
                        raw_key = raw_out.replace("-", "_").lower() if isinstance(raw_out, str) else ""
                        outcome = _shot_out_map.get(raw_key)
                        if not outcome:
                            if "goal" in raw_key:
                                outcome = "goal"
                            elif "save" in raw_key:
                                outcome = "saved"
                            elif "block" in raw_key:
                                outcome = "blocked"
                            elif "post" in raw_key or "bar" in raw_key:
                                outcome = "woodwork"
                            elif "miss" in raw_key or "off" in raw_key:
                                outcome = "off_target"
                        shots_all.append({
                            "source_event_id": enr.get("event_id"),
                            "player_sofascore_id": player.get("id"),
                            "assist_player_sofascore_id": assist.get("id"),
                            "team": side,
                            "isHome": s.get("isHome"),
                            "minute": minute,
                            "timeSeconds": time_seconds,  # kept only for potential future derivations (not persisted)
                            "x": x,
                            "y": y,
                            "xg": s.get("xg") if s.get("xg") is not None else s.get("expectedGoals"),
                            "body_part": s.get("bodyPart"),
                            "situation": s.get("situation"),
                            "is_penalty": s.get("isPenalty") or s.get("penalty"),
                            "is_own_goal": s.get("isOwnGoal") or s.get("ownGoal"),
                            "outcome": outcome,
                            "source": "sofascore",
                            "source_item_id": s.get("id") or idx,
                        })
                    except Exception:
                        continue
            if shots_all:
                bundle["shots"] = shots_all
            else:
                # Diagnostics if we parsed none
                empty_shapes = {"none": 0, "list": 0, "dict": 0}
                non_empty = 0
                for enr in enriched_events:
                    raw = enr.get("_raw_shots")
                    if raw is None or raw == []:
                        empty_shapes["none"] += 1
                    elif isinstance(raw, list):
                        empty_shapes["list"] += 1
                        if raw:
                            non_empty += 1
                    elif isinstance(raw, dict):
                        empty_shapes["dict"] += 1
                        if any(isinstance(raw.get(k), list) and raw.get(k) for k in ("shotmap","shots","items","data")):
                            non_empty += 1
                logger.debug(f"[shots] debug parsed=0 events={len(enriched_events)} non_empty_candidates={non_empty} shapes={empty_shapes}")

            # --- average positions parse ---
            avgpos_all: List[Dict[str, Any]] = []
            dropped_ap_no_pid = dropped_ap_no_xy = 0
            for enr in enriched_events:
                raw_ap = enr.get("_raw_avg_positions")
                if not raw_ap:
                    continue
                base = enr.get("event") or {}
                home_tid = (base.get("homeTeam") or {}).get("id")
                away_tid = (base.get("awayTeam") or {}).get("id")

                def _yield_items(raw_obj):
                    # Many possible shapes; emulate robust debug builder
                    if isinstance(raw_obj, dict):
                        # direct keys home/away may be list or dict
                        for side_key in ("home", "away"):
                            block = raw_obj.get(side_key)
                            if isinstance(block, list):
                                for it in block:
                                    yield side_key, it
                            elif isinstance(block, dict):
                                lst = block.get("players") or block.get("items") or block.get("statistics") or []
                                if isinstance(lst, list):
                                    for it in lst:
                                        yield side_key, it
                        # teams list
                        teams_list = raw_obj.get("teams")
                        if isinstance(teams_list, list):
                            for t in teams_list:
                                if not isinstance(t, dict):
                                    continue
                                lst = t.get("players") or t.get("items") or []
                                side = "home" if t.get("isHome") else ("away" if t.get("isHome") is False else None)
                                if side and isinstance(lst, list):
                                    for it in lst:
                                        yield side, it
                        # generic list containers
                        for key in ("players", "items", "statistics"):
                            lst = raw_obj.get(key)
                            if isinstance(lst, list):
                                for it in lst:
                                    side = "home" if (it.get("isHome") is True) else ("away" if it.get("isHome") is False else None)
                                    yield side, it
                    elif isinstance(raw_obj, list):
                        for it in raw_obj:
                            if not isinstance(it, dict):
                                continue
                            side = "home" if it.get("isHome") else ("away" if it.get("isHome") is False else None)
                            yield side, it

                for side_guess, item in _yield_items(raw_ap):
                    if not isinstance(item, dict):
                        continue
                    player = item.get("player") or item
                    pid = player.get("id") or item.get("playerId")
                    if not pid:
                        dropped_ap_no_pid += 1
                        continue
                    # Determine side / team
                    tid = (item.get("team") or {}).get("id") or item.get("teamId")
                    side = None
                    if tid == home_tid:
                        side = "home"
                    elif tid == away_tid:
                        side = "away"
                    if not side:
                        side = side_guess or ("home" if item.get("isHome") is True else ("away" if item.get("isHome") is False else None))
                    # coordinate fallbacks (preserve 0.0 values)
                    def _first(*vals):
                        for v in vals:
                            if v is None:
                                continue
                            return v
                        return None
                    x = _first(item.get("x"), item.get("avgX"), item.get("averageX"), (item.get("position") or {}).get("x"))
                    y = _first(item.get("y"), item.get("avgY"), item.get("averageY"), (item.get("position") or {}).get("y"))
                    if x is None or y is None:
                        dropped_ap_no_xy += 1
                        continue
                    touches = _first(item.get("touches"), item.get("touchesCount"), item.get("count"))
                    minutes_played = _first(item.get("minutes"), item.get("minutesPlayed"), item.get("mins"))
                    avgpos_all.append({
                        "source_event_id": enr.get("event_id"),
                        "player_sofascore_id": pid,
                        "team_sofascore_id": home_tid if side=="home" else (away_tid if side=="away" else None),
                        "avg_x": x,
                        "avg_y": y,
                        "touches": touches,
                        "minutes_played": minutes_played,
                    })
            if avgpos_all:
                bundle["average_positions"] = avgpos_all
            else:
                # diagnostics
                ap_shapes = {"none":0,"dict":0,"list":0}
                ap_non_empty = 0
                for enr in enriched_events:
                    raw_ap = enr.get("_raw_avg_positions")
                    if not raw_ap:
                        ap_shapes["none"] += 1
                    elif isinstance(raw_ap, dict):
                        ap_shapes["dict"] += 1
                        if any(isinstance(raw_ap.get(k), (list,dict)) for k in ("home","away","players","items","teams")):
                            ap_non_empty += 1
                    elif isinstance(raw_ap, list):
                        ap_shapes["list"] += 1
                        if raw_ap:
                            ap_non_empty += 1
                logger.debug(f"[avgpos] debug parsed=0 events={len(enriched_events)} non_empty_candidates={ap_non_empty} shapes={ap_shapes}")
            if dropped_ap_no_pid or dropped_ap_no_xy:
                logger.debug(f"[avgpos] dropped no_pid={dropped_ap_no_pid} no_xy={dropped_ap_no_xy} kept={len(avgpos_all)}")
        # Collect unique competition+season combos from matches (once per day)
        matches_list = bundle.get("matches", []) or []
        for m in matches_list:
            comp_sofa = m.get("competition_sofascore_id")
            season_str = m.get("season")
            if not (comp_sofa and season_str):
                continue
            key = (comp_sofa, season_str)
            if key in fetched_standings_keys:
                continue
            # Retrieve season_id from corresponding enriched event (first occurrence)
            season_id = None
            for enr in enriched_events:
                if int(enr.get("event_id") or 0) == m.get("source_event_id"):
                    base = enr.get("event") or {}
                    season_obj = base.get("season") or {}
                    season_id = season_obj.get("id") if isinstance(season_obj, dict) else None
                    break
            raw_std, used_path = _fetch_standings(browser, int(comp_sofa), int(season_id) if season_id else None)
            fetched_standings_keys.add(key)
            if raw_std:
                try:
                    parsed = standings_processor.parse(raw_std, int(comp_sofa), season_str)
                    standings_rows.extend(parsed)
                    logger.info(f"[standings] comp={comp_sofa} season={season_str} rows={len(parsed)} via={used_path}")
                except Exception as e:
                    logger.debug(f"Standings parse failed comp={comp_sofa} season={season_str}: {e}")
            else:
                logger.debug(f"[standings] no data comp={comp_sofa} season={season_str}")

        if standings_rows:
            bundle["standings"] = standings_rows
        else:
            bundle.setdefault("standings", [])

        # DEBUG counts (once per day)
        logger.info(
            "[debug] bundle counts pre-store: matches=%d lineups=%d formations=%d events=%d player_stats=%d match_stats=%d shots=%d avg_pos=%d managers=%d match_managers=%d standings=%d" % (
                len(bundle.get("matches", [])),
                len(bundle.get("lineups", [])),
                len(bundle.get("formations", [])),
                len(bundle.get("events", [])),
                len(bundle.get("player_stats", [])),
                len(bundle.get("match_stats", [])),
                len(bundle.get("shots", [])),
                len(bundle.get("average_positions", [])),
                len(bundle.get("managers", [])),
                len(bundle.get("match_managers", [])),
                len(bundle.get("standings", [])),
            )
        )

        if dry_run:
            logger.info(f"[DRY] {day.date()} → bundle sizes: " +
                        ", ".join(f"{k}={len(v)}" for k, v in bundle.items()))
        else:
            counts = store_bundle(bundle)
            for k, v in counts.items():
                total_saved[k] = total_saved.get(k, 0) + (v or 0)
            logger.info("Saved: " + ", ".join(f"{k}={counts.get(k,0)}" for k in total_saved.keys()))

        # end for days loop
        logger.info(f"✅ Done. Days={total_days}, events={total_events}")
        if not dry_run:
            logger.info("Totals saved: " + ", ".join(f"{k}={v}" for k, v in total_saved.items()))
    finally:
        with contextlib.suppress(Exception):
            browser.close()

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Init match dataset (history + forward)")
    p.add_argument("--days-back", type=int, default=DAYS_BACK_DEFAULT)
    p.add_argument("--days-forward", type=int, default=DAYS_FORWARD_DEFAULT)
    p.add_argument("--limit-days", type=int, default=None, help="Limit number of days processed")
    p.add_argument("--start", type=str, help="YYYY-MM-DD (overrides days-back)")
    p.add_argument("--end", type=str, help="YYYY-MM-DD (overrides days-forward)")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--batch-size", type=int, default=BATCH_SIZE_DEFAULT)  # kept for compatibility
    p.add_argument("--throttle", type=float, default=0.0, help="Seconds sleep after each API call (rate limiting)")
    p.add_argument("--no-progress", action="store_true", help="Disable tqdm progress bar output")
    return p.parse_args()

def main():
    args = parse_args()
    today = datetime.now(timezone.utc)

    if args.start and args.end:
        start = datetime.fromisoformat(args.start).replace(tzinfo=timezone.utc)
        end = datetime.fromisoformat(args.end).replace(tzinfo=timezone.utc)
    else:
        start = (today - timedelta(days=args.days_back)).replace(hour=0, minute=0, second=0, microsecond=0)
        end = (today + timedelta(days=args.days_forward)).replace(hour=0, minute=0, second=0, microsecond=0)

    if args.limit_days is not None:
        # clamp end date to limit total days
        total = (end.date() - start.date()).days + 1
        if total > args.limit_days:
            end = (start + timedelta(days=args.limit_days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)

        # run (cleanup handled inside run())
        run(start, end, dry_run=args.dry_run, throttle=args.throttle, show_progress=not args.no_progress)

if __name__ == "__main__":
    main()
