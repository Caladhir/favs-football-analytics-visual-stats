# scraper/legacy/init_match_dataset.py - Bulk init dataset (2y back + 1y fwd) or custom range
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
if str(SCRAPER_DIR) not in sys.path:
    sys.path.insert(0, str(SCRAPER_DIR))


from utils.logger import get_logger
from core.database import db
# Browser alias is usually exported as Browser, but be defensive:
try:
    from core.browser import Browser  # alias to BrowserManager
except Exception:
    from core.browser import BrowserManager as Browser
from processors.match_processor import MatchProcessor
from processors.stats_processor import parse_event_statistics, stats_processor
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

def store_bundle(bundle: Dict[str, List[Dict[str, Any]]], browser: Any | None = None, throttle: float = 0.0) -> Dict[str, int]:
    """Store a processed bundle with proper FK mapping.

    Steps:
      1. Upsert competitions, teams, players first.
      2. Map sofascore IDs -> UUIDs.
      3. Prepare match rows with FK IDs and upsert matches.
      4. Map (source, source_event_id) -> match_id.
      5. Transform dependent tables (lineups, formations, events, stats) to use match_id / team_id / player_id.
    """
    counts: Dict[str, Tuple[int, int]] = {}
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
    # (ENH) U nekim slučajevima shotmap sadrži igrače koji nisu bili u lineups (npr. kasni sub / own goal atribucija) → dodaj placeholder igrače
    players = []
    base_players_list = bundle.get("players", []) or []
    existing_player_ids = {p.get("sofascore_id") for p in base_players_list if p.get("sofascore_id")}
    # Skupi potencijalno propuštene igrače iz shots prije mapiranja (jednom, NE u petlji upserta)
    missing_from_shots: set[int] = set()
    for s in (bundle.get("shots") or []):
        pid = s.get("player_sofascore_id")
        if pid and pid not in existing_player_ids:
            missing_from_shots.add(pid)
        apid = s.get("assist_player_sofascore_id")
        if apid and apid not in existing_player_ids:
            missing_from_shots.add(apid)
    if missing_from_shots:
        # Dodaj minimalne zapise; full_name ne smije biti NULL (NOT NULL constraint)
        for pid in missing_from_shots:
            if pid not in existing_player_ids:  # avoid dupe append
                base_players_list.append({
                    "sofascore_id": pid,
                    "full_name": f"Unknown #{pid}",  # placeholder ime
                })
        logger.info(f"[players] dodano placeholder iz shots (new) count={len(missing_from_shots)}")
    # Sada pripremi players payload samo jednom
    for p in base_players_list:
        p2 = dict(p)
        tsid = p2.pop("team_sofascore_id", None)
        if tsid is not None and tsid in team_map and not p2.get("team_id"):
            p2["team_id"] = team_map.get(tsid)
        players.append(p2)
    if players:
        counts["players"] = db.upsert_players(players)
        logger.info(f"[players] upsert total={len(players)} (uklj.placeholder) base={len(base_players_list)}")

    # manager upserts after players so we can map team ids similarly
    managers = []
    for m in bundle.get("managers", []) or []:
        m2 = dict(m)
        tsid = m2.pop("team_sofascore_id", None)
        if tsid is not None and tsid in team_map and not m2.get("team_id"):
            m2["team_id"] = team_map.get(tsid)
        managers.append(m2)
    if managers:
        # Fallback enrichment for managers missing nationality/date_of_birth via manager/{id} endpoint (primary), coach/{id} (legacy)
        missing_detail = [m for m in managers if not (m.get("nationality") and m.get("date_of_birth")) and m.get("sofascore_id")]
        if missing_detail:
            seen_mgr: set[int] = set()
            for m in missing_detail:
                mid = m.get("sofascore_id")
                if mid in seen_mgr:
                    continue
                seen_mgr.add(mid)
                detail = None
                # Try manager/{id}
                try:
                    detail = browser.fetch_data(f"manager/{mid}") or {}
                    if throttle > 0:
                        time.sleep(throttle)
                except Exception as _mgr_ex:
                    logger.debug(f"[managers][detail_fetch_fail_manager_ep] id={mid} err={_mgr_ex}")
                # Fallback coach/{id}
                if not detail:
                    try:
                        detail = browser.fetch_data(f"coach/{mid}") or {}
                        if throttle > 0:
                            time.sleep(throttle)
                    except Exception as _mgr_ex2:
                        logger.debug(f"[managers][detail_fetch_fail_coach_ep] id={mid} err={_mgr_ex2}")
                if not isinstance(detail, dict):
                    continue
                node = None
                # Possible wrappers: {"manager": {...}} or {"coach": {...}}
                for key in ("manager","coach"):
                    if isinstance(detail.get(key), dict):
                        node = detail.get(key)
                        break
                if node is None:
                    node = detail
                if not isinstance(node, dict):
                    continue
                # Nationality from nested country or flat fields
                if not m.get("nationality"):
                    ctry = node.get("country") or {}
                    nat = None
                    if isinstance(ctry, dict):
                        nat = ctry.get("name") or ctry.get("alpha2") or ctry.get("alpha3")
                    if not nat:
                        nat = node.get("nationality")
                    if nat:
                        m["nationality"] = nat
                # Date of birth
                if not m.get("date_of_birth"):
                    dob = node.get("dateOfBirth") or node.get("birthDate")
                    ts_raw = node.get("dateOfBirthTimestamp")
                    if not dob and ts_raw is not None:
                        try:
                            ts = int(ts_raw)
                            # ms -> s if huge positive
                            if ts > 10**12:
                                ts //= 1000
                            # Manual conversion so negative (pre-1970) works cross‑platform
                            epoch = datetime(1970,1,1, tzinfo=timezone.utc)
                            dob_dt = epoch + timedelta(seconds=ts)
                            dob = dob_dt.date().isoformat()
                        except Exception:
                            dob = None
                    if dob:
                        m["date_of_birth"] = dob
            miss_nat = sum(1 for x in managers if x.get("nationality"))
            miss_dob = sum(1 for x in managers if x.get("date_of_birth"))
            logger.info(f"[managers] after coach fallback enrichment nationality={miss_nat}/{len(managers)} dob={miss_dob}/{len(managers)}")
        # Deduplicate by (full_name, team_id) first to avoid unique constraint violation
        dedup: dict[tuple[str, str], dict] = {}
        for m in managers:
            fname = (m.get("full_name") or "").strip().lower()
            tid = m.get("team_id") or ""
            key = (fname, tid)
            prev = dedup.get(key)
            if not prev:
                dedup[key] = m
            else:
                # prefer record with nationality/birth_date
                score_prev = int(bool(prev.get("nationality"))) + int(bool(prev.get("date_of_birth") or prev.get("birth_date")))
                score_new = int(bool(m.get("nationality"))) + int(bool(m.get("date_of_birth") or m.get("birth_date")))
                if score_new > score_prev:
                    dedup[key] = m
        # Single logging + single upsert
        total_mgr = len(managers)
        nat_cnt = sum(1 for x in managers if x.get("nationality"))
        dob_cnt = sum(1 for x in managers if x.get("date_of_birth") or x.get("birth_date"))
        logger.info(f"[managers] pre-dedupe total={total_mgr} with_nat={nat_cnt} with_dob={dob_cnt} unique_pairs={len(dedup)}")
        dedup_nat = sum(1 for x in dedup.values() if x.get("nationality"))
        dedup_dob = sum(1 for x in dedup.values() if x.get("date_of_birth") or x.get("birth_date"))
        logger.info(f"[managers] post-dedupe with_nat={dedup_nat} with_dob={dedup_dob}")
        counts["managers"] = db.upsert_managers(list(dedup.values()))
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
                description = ev.get("text") or ev.get("description") or event_type or "event"
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

        # shots transform (FK mapping) – was previously removed; reintroduce
        raw_shots_rows = bundle.get("shots", []) or []
        shot_rows: list[dict[str, Any]] = []
        drop_mid=drop_player=drop_minute=drop_xy=drop_outcome=0
        derived_minute=0
        for r in raw_shots_rows:
            try:
                eid = r.get("source_event_id")
                mid = se_to_mid.get(eid)
                if not mid:
                    drop_mid +=1; continue
                # player id may be flat (player_sofascore_id) or nested (player.id)
                player_src = r.get("player_sofascore_id")
                if player_src is None:
                    p_obj = r.get("player") or {}
                    if isinstance(p_obj, dict):
                        player_src = p_obj.get("id")
                player_id = player_map.get(player_src) if player_src is not None else None
                if not player_id:
                    drop_player +=1; continue
                # minute can be explicit, nested time.minute, or raw integer "time"
                minute = r.get("minute")
                if minute is None:
                    t_block = r.get("time")
                    if isinstance(t_block, dict) and t_block.get("minute") is not None:
                        minute = t_block.get("minute"); derived_minute +=1
                    elif isinstance(t_block, int):
                        # SofaScore shotmap uses integer 'time' for minute
                        minute = t_block; derived_minute +=1
                    else:
                        # fallback sentinel (do NOT drop row)
                        minute = -1; drop_minute +=1
                # seconds – prefer explicit second, else timeSeconds modulo 60
                second_val = r.get("second")
                if second_val is None:
                    ts = r.get("timeSeconds")
                    if isinstance(ts, (int, float)):
                        second_val = int(ts % 60)
                # coordinates may be flat x/y or nested in playerCoordinates
                x = r.get("x"); y = r.get("y")
                if x is None or y is None:
                    pc = r.get("playerCoordinates") or r.get("player_coordinates") or {}
                    if isinstance(pc, dict):
                        x = x if x is not None else pc.get("x")
                        y = y if y is not None else pc.get("y")
                if x is None or y is None:
                    drop_xy +=1; continue
                # outcome may be under 'outcome' or 'shotType'
                outcome = r.get("outcome") or r.get("shotType")
                if outcome is None:
                    # retain row with placeholder outcome instead of dropping
                    outcome = "unknown"
                o_raw = str(outcome).strip().lower()
                norm_map = {"miss":"off_target","offtarget":"off_target","save":"saved","saved":"saved","block":"blocked","blocked":"blocked","post":"woodwork","woodwork":"woodwork","bar":"woodwork","crossbar":"woodwork"}
                outcome = norm_map.get(o_raw, o_raw or "unknown")
                assist_src = r.get("assist_player_sofascore_id")
                assist_id = player_map.get(assist_src) if assist_src is not None else None
                side = r.get("team")
                if side not in ("home","away") and isinstance(r.get("isHome"), bool):
                    side = "home" if r.get("isHome") else "away"
                team_id=None
                if side in ("home","away"):
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
            logger.info(f"[shots] prepared rows={len(shot_rows)} raw={len(raw_shots_rows)} drops mid={drop_mid} player={drop_player} minute_dropped={drop_minute} minute_derived={derived_minute} xy={drop_xy} outcome={drop_outcome} sample_keys={list(shot_rows[0].keys()) if shot_rows else None}")
            counts["shots"] = db.upsert_shots(shot_rows)
        else:
            if raw_shots_rows:
                # extra debug: inspect first 5 raw entries structure to understand missing minute/x/y
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
                        "raw_keys": list(s.keys())
                    })
                logger.debug(f"[shots][debug sample] first5={sample}")
                logger.warning(f"[shots] first pass zero mapped raw={len(raw_shots_rows)} mid={drop_mid} player={drop_player} minute={drop_minute} xy={drop_xy} outcome={drop_outcome}")
            # Ako je najviše dropova zbog player_id, pokušaj drugi pass nakon što možda sada imamo nove player_id (placeholder upsert)
            if raw_shots_rows and drop_player > 0 and (drop_player >= (len(raw_shots_rows) * 0.6)):
                logger.info("[shots] second-pass attempt (player_id mapping)")
                # refresh player_map
                player_map_second = db.get_player_ids_by_sofa([p.get("sofascore_id") for p in players]) if players else {}
                shot_rows2 = []
                drop_player2=0
                for r in raw_shots_rows:
                    try:
                        eid = r.get("source_event_id")
                        mid = se_to_mid.get(eid)
                        if not mid:
                            continue
                        player_src = r.get("player_sofascore_id")
                        player_id = player_map_second.get(player_src) if player_src is not None else None
                        if not player_id:
                            drop_player2 +=1; continue
                        minute = r.get("minute")
                        if minute is None:
                            t_block = r.get("time") or {}
                            if isinstance(t_block, dict) and t_block.get("minute") is not None:
                                minute = t_block.get("minute")
                            else:
                                minute = -1
                        x=r.get("x"); y=r.get("y")
                        if x is None or y is None:
                            continue
                        outcome = r.get("outcome")
                        if outcome is None:
                            continue
                        assist_src = r.get("assist_player_sofascore_id")
                        assist_id = player_map_second.get(assist_src) if assist_src is not None else None
                        side = r.get("team")
                        team_id=None
                        if side in ("home","away"):
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

    # 5e) player_stats (now also carries touches & minutes)
        # --- Fallback sources prep (average_positions + shots) before building rows ---
        ap_touch_map: dict[tuple[int,int], dict[str, any]] = {}
        for ap in bundle.get("average_positions", []) or []:
            try:
                eid_ap = ap.get("source_event_id")
                pid_ap = ap.get("player_sofascore_id")
                if eid_ap is None or pid_ap is None:
                    continue
                t_ap = ap.get("touches")
                m_ap = ap.get("minutes_played")
                if t_ap is not None or m_ap is not None:
                    ap_touch_map[(int(eid_ap), int(pid_ap))] = {"touches": t_ap, "minutes_played": m_ap}
            except Exception:
                continue
        shot_agg: dict[tuple[int,int], dict[str,int]] = {}
        for sh in bundle.get("shots", []) or []:
            try:
                eid_sh = sh.get("source_event_id")
                pid_sh = sh.get("player_sofascore_id")
                if eid_sh is None or pid_sh is None:
                    continue
                key = (int(eid_sh), int(pid_sh))
                agg = shot_agg.setdefault(key, {"total":0, "on_target":0})
                agg["total"] += 1
                outcome = (sh.get("outcome") or "").lower()
                # Treat goal/saved/blocked/woodwork as on_target family (exclude off_target/unknown)
                if outcome in {"goal","saved","blocked","woodwork"}:
                    agg["on_target"] += 1
            except Exception:
                continue
        fallback_touches = fallback_minutes = fallback_shots_total = fallback_shots_on_target = 0
        ps_rows = []
        # map for later enrichment of average_positions ( (match_id, player_id) -> minutes_played )
    ps_minutes_map: dict[tuple[str, str], int] = {}
    subs_index = bundle.get("_subs_index") or {}
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
            # --- Extract stats with synonym mapping ---
            # Source payloads are inconsistent; unify into our canonical columns.
            synonyms = {
                # canonical : list of possible source keys (legacy plain 'shots' više ne kopiramo u zasebnu kolonu)
                "shots_total": ["shots_total", "shotsTotal", "totalShots"],
                "shots_on_target": ["shots_on_target", "shotsOnTarget", "onTargetShots", "shotsOn" ],
                "rating": ["rating", "sofascore_rating", "playerRating", "sofaScoreRating"],
                "touches": ["touches", "touchesCount", "count"],
                "minutes_played": ["minutes_played", "minutesPlayed", "minutes"],
            }
            def pull(key: str) -> Any:
                # direct field or nested statistics/stats blocks
                for source_key in synonyms.get(key, [key]):
                    if source_key in r and r.get(source_key) not in (None, ""):
                        return r.get(source_key)
                # nested search
                for nest_key in ("statistics", "stats"):
                    node = r.get(nest_key)
                    if isinstance(node, dict):
                        for source_key in synonyms.get(key, [key]):
                            if source_key in node and node.get(source_key) not in (None, ""):
                                return node.get(source_key)
                return None
            # extract touches & minutes variants (legacy code path) – now replaced by generic pull()
            touches_val = r.get("touches")
            if touches_val is None:
                for nest_key in ("statistics", "stats"):
                    node = r.get(nest_key)
                    if isinstance(node, dict):
                        touches_val = node.get("touches") or node.get("touchesCount") or node.get("count") or touches_val
                    if touches_val is not None:
                        break
            minutes_val = r.get("minutes_played")
            if minutes_val is None:
                for nest_key in ("statistics", "stats"):
                    node = r.get(nest_key)
                    if isinstance(node, dict):
                        minutes_val = node.get("minutes_played") or node.get("minutesPlayed") or node.get("minutes") or minutes_val
                    if minutes_val is not None:
                        break
            # Build base row from a whitelist (legacy kolona 'shots' uklonjena – koristimo shots_total / shots_on_target)
            base_keys = {"goals","assists","passes","tackles","rating","minutes_played","is_substitute","was_subbed_in","was_subbed_out","shots_total","shots_on_target","touches"}
            row = {k: v for k, v in r.items() if k in base_keys}
            # Enrich / override with synonym extracted values
            st = pull("shots_total")
            if st is not None: row["shots_total"] = st
            sot = pull("shots_on_target")
            if sot is not None: row["shots_on_target"] = sot
            rat = pull("rating")
            if rat is not None: row["rating"] = rat
            if touches_val is None:
                touches_val = pull("touches")
            if touches_val is not None:
                row["touches"] = touches_val
            if minutes_val is not None:
                row["minutes_played"] = minutes_val
            # --- Integrate substitution timing to refine minutes ---
            try:
                if eid is not None and pid is not None:
                    sub_key = (int(eid), int(pid))
                    sub_info = subs_index.get(sub_key)
                    if sub_info:
                        in_min = sub_info.get("in_minute")
                        out_min = sub_info.get("out_minute")
                        # Mark flags
                        if in_min is not None:
                            row["was_subbed_in"] = True
                        if out_min is not None:
                            row["was_subbed_out"] = True
                        # Adjust minutes_played if we have bounds
                        # Assume match regulation length 90; if both present: minutes = out_min - in_min
                        # If only out_min: minutes = out_min (player started until subbed) unless shorter existing value
                        # If only in_min: minutes = 90 - in_min (played remaining) unless shorter existing value
                        existing_min = None
                        try:
                            existing_min = int(row.get("minutes_played")) if row.get("minutes_played") not in (None, "") else None
                        except Exception:
                            existing_min = None
                        if in_min is not None and out_min is not None and out_min >= in_min:
                            calc = out_min - in_min
                            if existing_min is None or abs(calc - existing_min) > 2:  # overwrite if large discrepancy
                                row["minutes_played"] = calc
                        elif in_min is not None and out_min is None:
                            calc = 90 - in_min if in_min <= 90 else max(0, 120 - in_min)
                            if existing_min is None or existing_min > calc:
                                row["minutes_played"] = calc
                        elif out_min is not None and in_min is None:
                            calc = out_min if out_min <= 120 else 90
                            if existing_min is None or existing_min > calc:
                                row["minutes_played"] = calc
            except Exception:
                pass
            # --- Fallback from average_positions (touches/minutes) ---
            try:
                ap_key = (int(eid), int(pid)) if (eid is not None and pid is not None) else None
                if ap_key and row.get("touches") is None:
                    ap_src = ap_touch_map.get(ap_key)
                    if ap_src and ap_src.get("touches") is not None:
                        row["touches"] = ap_src.get("touches")
                        fallback_touches += 1
                if ap_key and row.get("minutes_played") is None:
                    ap_src = ap_touch_map.get(ap_key)
                    if ap_src and ap_src.get("minutes_played") is not None:
                        row["minutes_played"] = ap_src.get("minutes_played")
                        fallback_minutes += 1
            except Exception:
                pass
            # --- Fallback from shots aggregation (shots_total / shots_on_target) ---
            try:
                sh_key = (int(eid), int(pid)) if (eid is not None and pid is not None) else None
                if sh_key and row.get("shots_total") is None:
                    agg = shot_agg.get(sh_key)
                    if agg and agg.get("total"):
                        row["shots_total"] = agg["total"]
                        fallback_shots_total += 1
                if sh_key and row.get("shots_on_target") is None:
                    agg = shot_agg.get(sh_key)
                    if agg and agg.get("on_target") is not None:
                        row["shots_on_target"] = agg["on_target"]
                        fallback_shots_on_target += 1
            except Exception:
                pass
            row.update({"match_id": mid, "player_id": player_id, "team_id": team_id})
            ps_rows.append(row)
            if row.get("minutes_played") is not None:
                ps_minutes_map[(mid, player_id)] = row["minutes_played"]
    # END for each player_stats row
    if ps_rows:
        # quick diagnostic counts once
        _c_rating = sum(1 for x in ps_rows if x.get("rating") is not None)
        _c_minutes = sum(1 for x in ps_rows if x.get("minutes_played") is not None)
        _c_st = sum(1 for x in ps_rows if x.get("shots_total") is not None)
        _c_sot = sum(1 for x in ps_rows if x.get("shots_on_target") is not None)
        _c_touch = sum(1 for x in ps_rows if x.get("touches") is not None)
        total_ps = len(ps_rows) or 1
        logger.info(
            "[player_stats] rows=%d rating=%d(%.1f%%) minutes=%d(%.1f%%)+fb(%d) shots_total=%d(%.1f%%)+fb(%d) shots_on_target=%d(%.1f%%)+fb(%d) touches=%d(%.1f%%)+fb(%d)" % (
                len(ps_rows),
                _c_rating, (_c_rating/total_ps)*100,
                _c_minutes, (_c_minutes/total_ps)*100, fallback_minutes,
                _c_st, (_c_st/total_ps)*100, fallback_shots_total,
                _c_sot, (_c_sot/total_ps)*100, fallback_shots_on_target,
                _c_touch, (_c_touch/total_ps)*100, fallback_touches,
            )
        )
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

        # 5i) average_positions (schema now only x,y without touches/minutes)
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
            })
        if ap_rows:
            counts["average_positions"] = db.upsert_average_positions(ap_rows)
            if dropped_ap_no_mid or dropped_ap_no_player or dropped_ap_no_xy:
                logger.debug(
                    f"[average_positions] kept={len(ap_rows)} drop_no_mid={dropped_ap_no_mid} drop_no_player={dropped_ap_no_player} drop_no_xy={dropped_ap_no_xy}"
                )
        else:
            if dropped_ap_no_mid or dropped_ap_no_player or dropped_ap_no_xy:
                logger.debug(f"[average_positions] all dropped no_mid={dropped_ap_no_mid} no_player={dropped_ap_no_player} no_xy={dropped_ap_no_xy}")
    # (Removed broad try/except to surface errors earlier; handle specific failures at finer granularity above.)

    # Convert (ok, fail) tuples to just ok counts for summary
    flat_counts = {k: (v[0] if isinstance(v, tuple) else v) for k, v in counts.items()}
    return flat_counts

try:
    from tqdm import tqdm  # type: ignore
except Exception:  # pragma: no cover
    tqdm = None  # fallback if tqdm not installed

def run(
    start: datetime,
    end: datetime,
    dry_run: bool,
    throttle: float = 0.0,
    show_progress: bool = True,
    max_events_per_day: int | None = None,
    skip_player_detail: bool = False,
    log_every: int = 50,
) -> None:
    """Main orchestration loop.

    Added runtime controls:
      - max_events_per_day: limit number of events processed per day (useful for quick tests)
      - skip_player_detail: skip per-player detail endpoint (faster, fewer requests)
      - log_every: progress log frequency while enriching events
    """
    logger.info(
        f"📅 Dump range: {start.date()} → {end.date()} (dry_run={dry_run}, throttle={throttle}s, max_events_per_day={max_events_per_day}, skip_player_detail={skip_player_detail})"
    )

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
            if max_events_per_day is not None and len(events) > max_events_per_day:
                logger.info(f"[limit] trimming events {len(events)} -> {max_events_per_day} for {day.date()}")
                events = events[:max_events_per_day]
            total_events += len(events)
            if not events:
                continue

            # Enrich events (lineups/incidents/statistics)
            enriched_events = []
            for ev_i, ev in enumerate(events, start=1):
                if ev_i == 1 or ev_i % max(1, log_every) == 0:
                    logger.info(f"[enrich] {ev_i}/{len(events)} eid={ev.get('id')}")
                enriched_events.append(enrich_event(browser, ev, throttle=throttle))

            # Extract stats: team stats from statistics endpoint; player stats directly from raw lineups for reliability
            for enr in enriched_events:
                eid_int = int(enr.get("event_id") or 0)
                if eid_int and enr.get("statistics"):
                    stats_out = parse_event_statistics(eid_int, enr.get("statistics"))
                    enr["_match_stats"] = stats_out.get("match_stats")
                # Player stats: prefer direct lineups parsing (contains per‑player statistics block)
                raw_lineups_full = enr.get("_raw_lineups")
                if eid_int and raw_lineups_full:
                    try:
                        enr["_player_stats"] = stats_processor.process_player_stats(raw_lineups_full, eid_int)
                    except Exception as _ps_ex:
                        logger.debug(f"[player_stats][parse_fail] event={eid_int} err={_ps_ex}")

            # Detailed per-player statistics fetch (event/{eventId}/player/{playerId}/statistics)
            # Only fills missing fields; does not overwrite existing non-null values.
            def _safe_int(v):
                try:
                    if v in (None, "", False):
                        return None
                    return int(v)
                except Exception:
                    return None
            def _safe_float(v):
                try:
                    if v in (None, "", False):
                        return None
                    return float(v)
                except Exception:
                    return None
            if not skip_player_detail:
                for enr in enriched_events:
                    eid = enr.get("event_id")
                    if not eid:
                        continue
                    lu = enr.get("lineups") or {}
                    # Collect unique player IDs from both sides
                    player_ids: set[int] = set()
                    for side in ("home", "away"):
                        for pl in (lu.get(side) or []):
                            pid = ((pl.get("player") or {}).get("id")) if isinstance(pl.get("player"), dict) else None
                            if pid:
                                player_ids.add(pid)
                    if not player_ids:
                        continue
                    ps_list = enr.get("_player_stats") or []
                    idx_by_pid = {r.get("player_sofascore_id"): r for r in ps_list if r.get("player_sofascore_id") is not None}
                    for pid in player_ids:
                        try:
                            detail = browser.fetch_data(f"event/{eid}/player/{pid}/statistics") or {}
                            if throttle > 0:
                                time.sleep(throttle)
                        except Exception as _d_ex:
                            logger.debug(f"[player_stats][detail_fetch_fail] event={eid} player={pid} err={_d_ex}")
                            continue
                        if not isinstance(detail, dict):
                            continue
                        stat_block = detail.get("statistics") or detail
                        if not isinstance(stat_block, dict):
                            continue
                        rec = idx_by_pid.get(pid)
                        if not rec:
                            rec = {"source": "sofascore", "source_event_id": eid, "player_sofascore_id": pid, "team": None}
                            ps_list.append(rec)
                            idx_by_pid[pid] = rec
                        mapping = {
                            "goals": ["goals"],
                            "assists": ["assists"],
                            "shots_total": ["totalShots", "shotsTotal", "shots"],
                            "shots_on_target": ["shotsOnTarget", "onTargetShots"],
                            "passes": ["totalPasses", "passes"],
                            "tackles": ["tackles", "totalTackles"],
                            "yellow_cards": ["yellowCards"],
                            "red_cards": ["redCards"],
                            "touches": ["touches", "ballTouches", "totalTouches"],
                            "minutes_played": ["minutesPlayed", "minutes"],
                            "rating": ["rating", "ratingNum", "playerRating"],
                        }
                        for field, keys in mapping.items():
                            if field == "rating":
                                current = rec.get("rating")
                                if current is not None and current != 6.3:
                                    continue
                                new_rating = None
                                for k in keys:
                                    if stat_block.get(k) not in (None, ""):
                                        try:
                                            new_rating = float(stat_block.get(k))
                                            break
                                        except Exception:
                                            pass
                                if new_rating is not None and (current is None or current == 6.3):
                                    rec["rating"] = new_rating
                                continue
                            if rec.get(field) is not None:  # preserve existing value (even 0)
                                continue
                            val = None
                            for k in keys:
                                if k in stat_block and stat_block.get(k) not in (None, ""):
                                    val = stat_block.get(k)
                                    break
                            if val is None:
                                continue
                            casted = _safe_int(val)
                            if casted is None:
                                casted = _safe_float(val)
                            if casted is not None:
                                rec[field] = casted
                    enr["_player_stats"] = ps_list
            else:
                logger.info("[player_stats] skip_player_detail=True (detail endpoint calls disabled)")

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
                        # Manager enrichment
                        nationality = None
                        birth_date = None
                        country_obj = m.get("country") or {}
                        if isinstance(country_obj, dict):
                            nationality = country_obj.get("name") or country_obj.get("alpha2")
                        if m.get("dateOfBirth"):
                            birth_date = m.get("dateOfBirth")
                        elif m.get("dateOfBirthTimestamp"):
                            try:
                                bd_ts = int(m.get("dateOfBirthTimestamp"))
                                if bd_ts > 10**12:
                                    bd_ts //= 1000
                                birth_date = datetime.utcfromtimestamp(bd_ts).strftime("%Y-%m-%d")
                            except Exception:
                                birth_date = None
                        managers_all.append({
                            "sofascore_id": m.get("id"),
                            "full_name": m.get("name"),
                            "team_sofascore_id": home_team_id if side=="home" else away_team_id,
                            "nationality": nationality,
                            "date_of_birth": birth_date,
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

            # --- Post-process substitution events to adjust player minutes & flags ---
            # We'll attach a temporary structure on bundle to be merged during player_stats storage.
            # Map: (event_id, player_sofa_id) -> {in_minute, out_minute}
            subs_index: Dict[tuple[int,int], Dict[str,int]] = {}
            for enr in enriched_events:
                ev_id = enr.get("event_id")
                if not ev_id:
                    continue
                incidents = enr.get("events") or []
                for inc in incidents:
                    try:
                        raw_type = str(inc.get("type") or "").lower()
                        if "substitution" not in raw_type:
                            continue
                        minute = None
                        for k in ("minute","minutes"):
                            if inc.get(k) is not None:
                                minute = int(inc.get(k)); break
                        if minute is None and isinstance(inc.get("time"), dict):
                            t = inc.get("time")
                            if t.get("minute") is not None:
                                minute = int(t.get("minute"))
                            if t.get("addMinutes") not in (None,""):
                                try: minute += int(t.get("addMinutes"))
                                except Exception: pass
                        if minute is None:
                            minute = 0
                        pin = inc.get("playerIn") or inc.get("player_in") or inc.get("playerInPlayer") or inc.get("player")
                        pout = inc.get("playerOut") or inc.get("player_out") or inc.get("playerOutPlayer") or inc.get("relatedPlayer")
                        in_id = pin.get("id") if isinstance(pin, dict) else None
                        out_id = pout.get("id") if isinstance(pout, dict) else None
                        if in_id:
                            key = (int(ev_id), int(in_id))
                            entry = subs_index.setdefault(key, {})
                            # first appearance minute for subbed in player
                            if "in_minute" not in entry:
                                entry["in_minute"] = minute
                        if out_id:
                            key2 = (int(ev_id), int(out_id))
                            entry2 = subs_index.setdefault(key2, {})
                            # last minute they were on pitch -> out_minute
                            if "out_minute" not in entry2:
                                entry2["out_minute"] = minute
                    except Exception:
                        continue
            bundle["_subs_index"] = subs_index

            # Inject parsed managers (including nationality & birth_date) before storage phase
            if managers_all:
                existing_mgr = bundle.get("managers") or []
                bundle["managers"] = existing_mgr + managers_all
            if match_managers_all:
                existing_mm = bundle.get("match_managers") or []
                bundle["match_managers"] = existing_mm + match_managers_all

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

            # Enrich players (nationality, height, date_of_birth) from lineups raw
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
                        # Extract date_of_birth if provided (dateOfBirth or timestamp)
                        dob_raw = pl.get("dateOfBirth") or pl.get("dateOfBirthTimestamp")
                        if dob_raw:
                            try:
                                if isinstance(dob_raw, (int, float)):
                                    ts = int(dob_raw)
                                    if ts > 10**12:  # ms to s
                                        ts //= 1000
                                    dob_str = datetime.utcfromtimestamp(ts).strftime("%Y-%m-%d")
                                elif isinstance(dob_raw, str) and len(dob_raw) >= 8:
                                    # assume already YYYY-MM-DD or similar
                                    dob_str = dob_raw[:10]
                                else:
                                    dob_str = None
                                if dob_str:
                                    pe.setdefault("date_of_birth", dob_str)
                            except Exception:
                                pass
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
            # Debug sample for player stats quality
            if bundle.get("player_stats"):
                _ps = bundle["player_stats"]
                present_counts = {
                    "rating": sum(1 for r in _ps if r.get("rating") is not None),
                    "minutes": sum(1 for r in _ps if r.get("minutes_played") is not None),
                    "shots_total": sum(1 for r in _ps if r.get("shots_total") is not None),
                    "shots_on_target": sum(1 for r in _ps if r.get("shots_on_target") is not None),
                    "touches": sum(1 for r in _ps if r.get("touches") is not None),
                    "goals": sum(1 for r in _ps if r.get("goals") is not None),
                    "assists": sum(1 for r in _ps if r.get("assists") is not None),
                    "passes": sum(1 for r in _ps if r.get("passes") is not None),
                    "tackles": sum(1 for r in _ps if r.get("tackles") is not None),
                }
                logger.debug(f"[player_stats][debug] rows={len(_ps)} present={present_counts} sample={ {k:v for k,v in _ps[0].items() if k in ('player_sofascore_id','minutes_played','rating','shots_total','shots_on_target','touches','goals','assists','passes','tackles')} }")
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
            _SHOT_OUTCOME_MAP = {"goal":"goal","scored":"goal","miss":"off_target","offtarget":"off_target","saved":"saved","save":"saved","blocked":"blocked","block":"blocked","post":"woodwork","woodwork":"woodwork","bar":"woodwork","crossbar":"woodwork","wide":"off_target","high":"off_target"}
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
                for idx, s in enumerate(candidates):
                    if not isinstance(s, dict):
                        continue
                    try:
                        player = (s.get("player") or {}) if isinstance(s.get("player"), dict) else {}
                        assist = (s.get("assist") or {}) if isinstance(s.get("assist"), dict) else {}
                        tid = (s.get("team") or {}).get("id") if isinstance(s.get("team"), dict) else s.get("teamId")
                        side = "home" if tid and tid == home_tid else ("away" if tid and tid == away_tid else None)
                        minute = s.get("minute")
                        if minute is None:
                            t_block = s.get("time") or {}
                            if isinstance(t_block, dict):
                                minute = t_block.get("minute") or t_block.get("minutes")
                            elif isinstance(t_block, int):
                                minute = t_block
                        if minute is None:
                            ts_val = s.get("timeSeconds")
                            if isinstance(ts_val, (int, float)):
                                minute = int(ts_val // 60)
                        x_val = s.get("x") if s.get("x") is not None else (s.get("position") or {}).get("x")
                        y_val = s.get("y") if s.get("y") is not None else (s.get("position") or {}).get("y")
                        if (x_val is None or y_val is None) and isinstance(s.get("playerCoordinates"), dict):
                            pc = s.get("playerCoordinates")
                            x_val = x_val if x_val is not None else pc.get("x")
                            y_val = y_val if y_val is not None else pc.get("y")
                        raw_outcome = (s.get("outcome") or s.get("shotResult") or s.get("result") or "").strip().lower()
                        canonical_outcome = _SHOT_OUTCOME_MAP.get(raw_outcome, raw_outcome or None)
                        goal_type = s.get("goalType") or s.get("type")
                        is_pen = bool(s.get("isPenalty") or s.get("penalty") or (s.get("situation") in ("penalty","Pen")))
                        is_own = bool(s.get("isOwnGoal") or s.get("ownGoal") or (isinstance(goal_type, str) and "own" in goal_type.lower()))
                        shots_all.append({
                            "source_event_id": enr.get("event_id"),
                            "player_sofascore_id": player.get("id"),
                            "assist_player_sofascore_id": assist.get("id"),
                            "team": side,
                            "minute": minute,
                            "x": x_val,
                            "y": y_val,
                            "xg": s.get("xg") if s.get("xg") is not None else s.get("expectedGoals"),
                            "body_part": s.get("bodyPart"),
                            "situation": s.get("situation"),
                            "is_penalty": is_pen,
                            "is_own_goal": is_own,
                            "outcome": canonical_outcome,
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
                    # Capture shallow stats payload if present for later fallback (touches/minutes)
                    stats_block = None
                    for key in ("statistics","stats","playerStatistics"):
                        if isinstance(item.get(key), dict):
                            stats_block = item.get(key); break
                        # sometimes inside nested player node
                        player_node = (item.get("player") if isinstance(item.get("player"), dict) else {})
                        if isinstance(player_node.get(key), dict):
                            stats_block = player_node.get(key); break
                    avgpos_all.append({
                        "source_event_id": enr.get("event_id"),
                        "player_sofascore_id": pid,
                        "team_sofascore_id": home_tid if side=="home" else (away_tid if side=="away" else None),
                        "avg_x": x,
                        "avg_y": y,
                        "touches": touches,
                        "minutes_played": minutes_played,
                        "statistics": stats_block,  # may contain touches/minutes variants
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
            counts = store_bundle(bundle, browser=browser, throttle=throttle)
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
    p.add_argument("--max-events-per-day", type=int, default=None, help="Process only first N events per day (speed/testing)")
    p.add_argument("--skip-player-detail", action="store_true", help="Skip per-player detail statistics endpoint (faster)")
    p.add_argument("--log-every", type=int, default=50, help="Log enrichment progress every N events")
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
        run(
            start,
            end,
            dry_run=args.dry_run,
            throttle=args.throttle,
            show_progress=not args.no_progress,
            max_events_per_day=args.max_events_per_day,
            skip_player_detail=args.skip_player_detail,
            log_every=args.log_every,
        )

if __name__ == "__main__":
    main()
