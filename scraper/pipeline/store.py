from __future__ import annotations
from typing import Dict, List, Any, Tuple
import datetime as _dt
from utils.logger import get_logger
from core.database import db
from .manager_enrichment import enrich_manager_details
from .player_enrichment import enrich_player_details

logger = get_logger(__name__)


def store_bundle(bundle: Dict[str, List[Dict[str, Any]]], browser=None, throttle: float = 0.0) -> Dict[str, Tuple[int,int]]:
    """Persist a prepared bundle (competitions, teams, players, matches, etc.).

    Returns mapping {table: (ok, fail)} similar to legacy implementation.
    This is a refactored version extracted from legacy.init_match_dataset.store_bundle
    to keep that script thin and reusable from fetch loop / backfills.
    """
    counts: Dict[str, Tuple[int,int]] = {}

    # 1) Base entities (competitions, teams) ---------------------------------
    comps = bundle.get("competitions", []) or []
    if comps:
        counts["competitions"] = db.upsert_competitions(comps)
        try:
            logger.info(f"[store][competitions][verify] db_count={db.table_count('competitions')}")
        except Exception:
            pass
    teams = bundle.get("teams", []) or []
    _teams_input = list(teams)  # keep original for diagnostic counts
    # optional enrichment for each team to pull venue/founded/capacity
    if teams and browser is not None:
        enriched_teams: List[Dict[str, Any]] = []
        for t in teams:
            t2 = dict(t)
            sid = t2.get("sofascore_id") or t2.get("id")
            if sid:
                try:
                    detail = browser.fetch_data(f"team/{sid}") or {}
                    if isinstance(detail, dict):
                        team_obj = detail.get("team") or detail
                        venue = team_obj.get("venue") or {}
                        # Normalize founded: convert foundationDateTimestamp (epoch) -> year
                        if "founded" not in t2:
                            f_raw = team_obj.get("foundationDateTimestamp") or team_obj.get("founded")
                            try:
                                year_val = None
                                if isinstance(f_raw, (int, float)):
                                    ts = int(f_raw)
                                    # treat as epoch seconds (positive or negative)
                                    if abs(ts) > 10**8:  # roughly > ~3 years, so epoch
                                        year_val = _dt.datetime.utcfromtimestamp(ts).year
                                    else:
                                        # likely already a year like 1907
                                        year_val = int(str(ts)[:4])
                                elif isinstance(f_raw, str) and f_raw:
                                    if f_raw.isdigit() and len(f_raw) >= 4:
                                        year_val = int(f_raw[:4])
                                    else:
                                        # extract first 4 consecutive digits
                                        import re
                                        m = re.search(r"(18|19|20)\d{2}", f_raw)
                                        if m:
                                            year_val = int(m.group(0))
                                if year_val and 1800 <= year_val <= _dt.datetime.utcnow().year:
                                    # DB kolona izgleda kao timestamptz -> šaljemo ISO (1 Jan) da izbjegnemo '2009' cast error
                                    try:
                                        t2["founded"] = f"{year_val:04d}-01-01T00:00:00Z"
                                    except Exception:
                                        t2["founded"] = None
                            except Exception:
                                pass
                        t2.setdefault("venue", venue.get("name") or (venue.get("stadium") or {}).get("name"))
                        t2.setdefault("venue_capacity", venue.get("capacity") or (venue.get("stadium") or {}).get("capacity"))
                except Exception:
                    pass
            enriched_teams.append(t2)
        teams = enriched_teams
    if teams:
        counts["teams"] = db.upsert_teams(teams)
        try:
            uniq_in = len({t.get("sofascore_id") for t in _teams_input if t.get("sofascore_id")})
            ok, fail = counts["teams"]
            logger.info(f"[store][teams] batch_in={len(_teams_input)} unique_in={uniq_in} upsert_ok={ok} fail={fail}")
            try:
                logger.info(f"[store][teams][verify] db_count={db.table_count('teams')}")
            except Exception:
                pass
        except Exception:
            pass

    # Maps for FK linking
    comp_map = db.get_competition_ids_by_sofa([c.get("sofascore_id") for c in comps]) if comps else {}
    team_map = db.get_team_ids_by_sofa([t.get("sofascore_id") for t in teams]) if teams else {}

    # 2) Players (inject team_id from team_sofascore_id) ---------------------
    # Build auxiliary maps from lineups BEFORE processing players so we can assign
    # missing team_sofascore_id and jersey number to player rows (some players only
    # appear in lineups, not in raw team player arrays).
    lineup_team_map: Dict[int, int] = {}
    lineup_number_map: Dict[int, Any] = {}
    try:
        for lr in (bundle.get("lineups") or []):
            psid = lr.get("player_sofascore_id")
            tsid = lr.get("team_sofascore_id") or lr.get("team_id")
            if isinstance(psid, int):
                if isinstance(tsid, int) and psid not in lineup_team_map:
                    lineup_team_map[psid] = tsid
                jn = lr.get("jersey_number") or lr.get("jerseyNumber") or lr.get("number")
                if jn is not None and psid not in lineup_number_map:
                    lineup_number_map[psid] = jn
    except Exception:
        pass
    players_raw = bundle.get("players", []) or []
    # placeholder logic is handled earlier in legacy script; just map team ids here
    players: List[Dict[str, Any]] = []
    for p in players_raw:
        p2 = dict(p)
        # normalise birth_date -> date_of_birth if present
        if p2.get("birth_date") and not p2.get("date_of_birth"):
            p2["date_of_birth"] = p2.pop("birth_date")
        # NEW: fallback – ako imamo timestamp a nema date_of_birth, konvertiraj
        if not p2.get("date_of_birth"):
            ts_raw = p2.get("dateOfBirthTimestamp") or p2.get("birthDateTimestamp")
            if ts_raw:
                try:
                    ts_int = int(ts_raw)
                    if ts_int > 10**12:  # ms -> s
                        ts_int //= 1000
                    from datetime import timezone, timedelta
                    epoch = _dt.datetime(1970, 1, 1, tzinfo=timezone.utc)
                    dob_dt = epoch + timedelta(seconds=ts_int)
                    dob_str = dob_dt.date().isoformat()
                    p2["date_of_birth"] = dob_str
                    # označi iz kojeg je izvora došao (debug) ako već nemamo _dob_src
                    p2.setdefault("_dob_src", "ts_fallback")
                except Exception:
                    pass
        tsid = p2.pop("team_sofascore_id", None)
        # If missing team_sofascore_id but present in lineup map, set it now (so mapping below can translate to FK)
        if tsid is None and p2.get("sofascore_id") in lineup_team_map:
            tsid = lineup_team_map.get(p2.get("sofascore_id"))
        # Fill missing jersey number from lineup if absent
        if not p2.get("number") and p2.get("sofascore_id") in lineup_number_map:
            p2["number"] = lineup_number_map.get(p2.get("sofascore_id"))
        # If legacy parse incorrectly set numeric team_id (sofascore) instead of FK UUID, remap
        raw_team_id = p2.get("team_id")
        if tsid is not None and tsid in team_map:
            p2["team_id"] = team_map.get(tsid)
        elif isinstance(raw_team_id, int) and raw_team_id in team_map:
            p2["team_id"] = team_map.get(raw_team_id)
        players.append(p2)
    if players:
        # Pre-enrichment fill of missing team_id using lineup_player_team (if we built it later, safe even if empty now)
        try:
            if 'lineup_player_team' in locals():
                for pl in players:
                    if not pl.get('team_id'):
                        sid = pl.get('sofascore_id')
                        if isinstance(sid, int) and sid in lineup_player_team:
                            pl['team_id'] = lineup_player_team[sid]
        except Exception:
            pass
        if browser is not None:
            enrich_player_details(browser, players, throttle=throttle)
            # Post-enrichment safety: još jednom konvertiraj raw timestamp ako je ostao
            for pl in players:
                if not pl.get("date_of_birth"):
                    ts_raw = pl.get("dateOfBirthTimestamp") or pl.get("birthDateTimestamp")
                    if ts_raw:
                        try:
                            ts_int = int(ts_raw)
                            if ts_int > 10**12:
                                ts_int //= 1000
                            from datetime import timezone as _tz
                            pl["date_of_birth"] = _dt.datetime.utcfromtimestamp(ts_int).replace(tzinfo=_tz.utc).date().isoformat()
                        except Exception:
                            pass
        # Debug: log sample of player DOB fields coverage
        try:
            dob_total = sum(1 for x in players if x.get("date_of_birth"))
            dob_ts_fallback = sum(1 for x in players if (not x.get("date_of_birth")) and x.get("dateOfBirthTimestamp"))
            dob_src_stats = sum(1 for x in players if x.get("_dob_src") == "stats_ts")
            sample = [{k: players[i].get(k) for k in ("sofascore_id","date_of_birth","full_name","_dob_src","dateOfBirthTimestamp")}
                      for i in range(min(2, len(players)))]
            # strip debug keys before upsert
            for x in players:
                x.pop("_dob_src", None)
            logger.info(f"[players][pre_upsert] count={len(players)} dob_present={dob_total} raw_ts_no_date={dob_ts_fallback} via_stats_ts={dob_src_stats} sample={sample}")
        except Exception:
            pass
        counts["players"] = db.upsert_players(players)

    # 3) Managers (enrich + dedupe) -----------------------------------------
    managers_raw = bundle.get("managers", []) or []
    managers: List[Dict[str, Any]] = []
    for m in managers_raw:
        m2 = dict(m)
        tsid = m2.pop("team_sofascore_id", None)
        if tsid is not None and tsid in team_map and not m2.get("team_id"):
            m2["team_id"] = team_map.get(tsid)
        managers.append(m2)
    if managers:
        # external enrichment (in-place)
        if browser is not None:
            enrich_manager_details(browser, managers, throttle=throttle)
        # dedupe by (full_name, team_id) prefer nationality + dob
        dedup: Dict[Tuple[str,str], Dict[str,Any]] = {}
        for m in managers:
            fname = (m.get("full_name") or "").strip().lower()
            tid = (m.get("team_id") or "")
            key = (fname, tid)
            prev = dedup.get(key)
            if not prev:
                dedup[key] = m
            else:
                score_prev = int(bool(prev.get("nationality"))) + int(bool(prev.get("date_of_birth") or prev.get("birth_date")))
                score_new = int(bool(m.get("nationality"))) + int(bool(m.get("date_of_birth") or m.get("birth_date")))
                if score_new > score_prev:
                    dedup[key] = m
        logger.info(f"[managers] pre-upsert unique_pairs={len(dedup)} coverage nat={sum(1 for x in dedup.values() if x.get('nationality'))}/{len(dedup)} dob={sum(1 for x in dedup.values() if x.get('date_of_birth'))}/{len(dedup)}")
        counts["managers"] = db.upsert_managers(list(dedup.values()))

    # 4) Matches (inject FK ids) --------------------------------------------
    match_rows: List[Dict[str, Any]] = []
    for m in bundle.get("matches", []) or []:
        m2 = dict(m)
        comp_sofa = m2.get("competition_sofascore_id")
        if comp_sofa:
            m2["competition_id"] = comp_map.get(comp_sofa)
        h_sofa = m2.get("home_team_sofascore_id")
        a_sofa = m2.get("away_team_sofascore_id")
        if h_sofa and not m2.get("home_team_id"):
            m2["home_team_id"] = team_map.get(h_sofa)
        if a_sofa and not m2.get("away_team_id"):
            m2["away_team_id"] = team_map.get(a_sofa)
        # ensure updated_at for status freshness
        m2.setdefault("updated_at", _dt.datetime.utcnow().isoformat())
        match_rows.append(m2)
    if match_rows:
        # Info log to confirm venue presence before DB upsert
        try:
            venues_present = sum(1 for m in match_rows if m.get("venue"))
            missing_ids = [m.get("source_event_id") for m in match_rows if not m.get("venue")]
            sample = {k: match_rows[0].get(k) for k in ("source_event_id","home_team","away_team","venue","status")}
            logger.info(f"[store][matches] rows={len(match_rows)} venues_present={venues_present} missing={len(match_rows)-venues_present} sample={sample} missing_ids={missing_ids[:10]}")
        except Exception:
            pass
        counts["matches"] = db.batch_upsert_matches(match_rows)
    else:
        logger.debug("[store][matches] no match rows -> skipping match_state snapshot")

    # 5) Build map (source,source_event_id)->match_id -----------------------
    # Build (source, source_event_id) -> match_id map (use real source if present; default 'sofascore')
    match_map = db.get_match_ids_by_source_ids([
        (m.get("source") or "sofascore", m.get("source_event_id"))
        for m in match_rows if m.get("source_event_id") is not None
    ]) if match_rows else {}
    # Primary map keeps (source, source_event_id) tuple keys
    se_to_mid = {(src, sid): mid for ((src, sid), mid) in match_map.items()}
    # Legacy/simple map by just source_event_id (many downstream bundles only carry the numeric id)
    se_to_mid_sid = {sid: mid for ((src, sid), mid) in match_map.items()}
    try:
        if match_rows:
            sample_sid = next((m.get("source_event_id") for m in match_rows if m.get("source_event_id") is not None), None)
            logger.debug(f"[store][match_map] built size={len(match_map)} sample_query_sid={sample_sid} sample_mid={match_map.get((match_rows[0].get('source') or 'sofascore', match_rows[0].get('source_event_id')))}")
    except Exception:
        pass

    # Match state snapshot (status / minute / score) for historical/backfill parity
    if match_rows:
        try:
            # High-level instrumentation so we SEE snapshot attempt even at INFO level
            logger.info(f"[store][match_state] snapshot_start match_rows={len(match_rows)} map_size={len(match_map)}")
            now_iso = _dt.datetime.utcnow().isoformat()
            ms_rows: List[Dict[str, Any]] = []
            missing_for_map: List[int] = []
            for m in match_rows:
                sid = m.get("source_event_id")
                src = m.get("source") or "sofascore"
                if sid is None:
                    continue
                mid = se_to_mid.get((src, sid))
                if not mid:
                    missing_for_map.append(sid)
                    continue
                ms_rows.append({
                    "match_id": mid,
                    "status": m.get("status"),
                    "status_type": m.get("status_type") or m.get("status"),
                    "minute": m.get("minute"),
                    "home_score": m.get("home_score"),
                    "away_score": m.get("away_score"),
                    "updated_at": now_iso,
                })
            # Fallback: if we missed some due to mapping failure, try a direct select by source_event_id only
            if missing_for_map:
                try:
                    client = getattr(db, 'client', None)
                    if client:
                        res = client.table('matches').select('id,source,source_event_id').in_('source_event_id', missing_for_map).execute()
                        tmp_idx = {}
                        for r in (res.data or []):
                            try:
                                tmp_idx[(r.get('source') or 'sofascore', int(r.get('source_event_id')))] = r.get('id')
                            except Exception:
                                pass
                        recovered = 0
                        for m in match_rows:
                            sid = m.get('source_event_id'); src = m.get('source') or 'sofascore'
                            if sid in missing_for_map and (src, sid) in tmp_idx:
                                ms_rows.append({
                                    "match_id": tmp_idx[(src, sid)],
                                    "status": m.get("status"),
                                    "status_type": m.get("status_type") or m.get("status"),
                                    "minute": m.get("minute"),
                                    "home_score": m.get("home_score"),
                                    "away_score": m.get("away_score"),
                                    "updated_at": now_iso,
                                })
                                recovered += 1
                        if recovered:
                            logger.debug(f"[store][match_state] recovered_mappings={recovered} from direct select")
                except Exception as ex_fb:
                    logger.debug(f"[store][match_state] fallback select failed: {ex_fb}")
                if ms_rows:
                    # Promote snapshot size to INFO for visibility
                    try:
                        statuses = {r.get('status') for r in ms_rows}
                        logger.info(f"[store][match_state] prepared rows={len(ms_rows)} distinct_statuses={len(statuses)} sample_statuses={list(statuses)[:5]}")
                    except Exception:
                        pass
                    logger.debug(f"[store][match_state] upserting rows={len(ms_rows)} sample={ms_rows[:1]}")
                    counts["match_state"] = db.upsert_match_state(ms_rows)
                    # === Reconcile: ensure canonical scores in `matches` reflect the snapshot ===
                    try:
                        client = getattr(db, 'client', None)
                        if client:
                            synced = 0
                            for row in ms_rows:
                                mid = row.get('match_id')
                                if not mid:
                                    continue
                                try:
                                    upd = {}
                                    if row.get('home_score') is not None:
                                        upd['home_score'] = row.get('home_score')
                                    if row.get('away_score') is not None:
                                        upd['away_score'] = row.get('away_score')
                                    # keep updated_at consistent
                                    if row.get('updated_at'):
                                        upd['updated_at'] = row.get('updated_at')
                                    if upd:
                                        client.table('matches').update(upd).eq('id', mid).execute()
                                        synced += 1
                                except Exception as _ue:
                                    logger.debug(f"[store][match_state_sync] failed update matches id={mid}: {_ue}")
                            logger.info(f"[store][match_state_sync] synced={synced} rows to matches table")
                    except Exception as _sync_ex:
                        logger.debug(f"[store][match_state_sync] reconciliation failed: {_sync_ex}")
            else:
                logger.info(f"[store][match_state] no rows built (match_map_size={len(match_map)} missing={len(missing_for_map)})")
        except Exception as ex_ms:
            # Escalate to WARNING so we know snapshot failed
            logger.warning(f"[store][match_state] snapshot failed err={ex_ms}")

    # Helper per-event side -> team_id
    side_team_cache: Dict[str, Dict[str,str]] = {}
    for m in match_rows:
        sid = m.get("source_event_id")
        if sid in se_to_mid_sid:
            side_team_cache[str(sid)] = {"home": m.get("home_team_id"), "away": m.get("away_team_id")}

    # Build player id map once (post players upsert) for downstream FKs
    player_map: Dict[int, int] = {}
    if bundle.get("players"):
        try:
            player_map = db.get_player_ids_by_sofa([p.get("sofascore_id") for p in bundle.get("players") if p.get("sofascore_id")])
        except Exception:
            player_map = {}

    # 6) Lineups ------------------------------------------------------------
    line_raw = bundle.get("lineups", []) or []
    line_rows: List[Dict[str, Any]] = []
    lineup_player_team: Dict[int, str] = {}
    for r in line_raw:
        eid = r.get("source_event_id")
        mid = se_to_mid_sid.get(eid)
        if not mid:
            continue
        team_id = None
        # Prefer explicit team_sofascore_id mapping if provided
        tsid = r.get("team_sofascore_id")
        if tsid and tsid in team_map:
            team_id = team_map.get(tsid)
        else:
            side = r.get("side")
            if side and str(eid) in side_team_cache:
                team_id = side_team_cache[str(eid)].get(side)
        pr = {k: v for k, v in r.items() if k not in ("source_event_id", "side")}
        pr["match_id"] = mid
        if team_id:
            pr.setdefault("team_id", team_id)
        # Map player_sofascore_id -> player_id
        psid = r.get("player_sofascore_id")
        if psid and psid in player_map:
            pr["player_id"] = player_map[psid]
        # capture player->team mapping for starters (team_id available here)
        try:
            if psid and team_id and psid not in lineup_player_team:
                lineup_player_team[psid] = team_id
        except Exception:
            pass
        line_rows.append(pr)
    if line_rows:
        logger.debug(f"[store] lineups in={len(line_raw)} mapped={len(line_rows)} sample={line_rows[:1]}")
        counts["lineups"] = db.upsert_lineups(line_rows)

    # 7) Formations ---------------------------------------------------------
    form_raw = bundle.get("formations", []) or []
    form_rows: List[Dict[str, Any]] = []
    for r in form_raw:
        eid = r.get("source_event_id")
        mid = se_to_mid_sid.get(eid)
        if not mid:
            continue
        team_id = None
        tsid = r.get("team_sofascore_id")
        if tsid and tsid in team_map:
            team_id = team_map.get(tsid)
        else:
            side = r.get("side")
            if side and str(eid) in side_team_cache:
                team_id = side_team_cache[str(eid)].get(side)
        fr = {k: v for k, v in r.items() if k not in ("source_event_id", "side")}
        fr["match_id"] = mid
        if team_id:
            fr["team_id"] = team_id
        form_rows.append(fr)
    if form_rows:
        logger.debug(f"[store] formations in={len(form_raw)} mapped={len(form_rows)} sample={form_rows[:1]}")
        counts["formations"] = db.upsert_formations(form_rows)

    # 8) Events -------------------------------------------------------------
    ev_rows: List[Dict[str, Any]] = []
    for r in bundle.get("events", []) or []:
        eid = r.get("source_event_id")
        mid = se_to_mid_sid.get(eid)
        if not mid:
            continue
        er = dict(r)
        er["match_id"] = mid
        ev_rows.append(er)
    if ev_rows:
        counts["events"] = db.upsert_match_events(ev_rows)

    # 9) Shots --------------------------------------------------------------
    sh_rows: List[Dict[str, Any]] = []
    _sid_missing = 0
    _sid_present = 0
    # Collect raw shot rows first to inspect missing player mappings
    raw_shots_bundle = bundle.get("shots", []) or []
    # Detect player IDs in shots that are not yet in player_map
    missing_shot_pids: List[int] = []
    try:
        existing_pids_set = set(player_map.keys())
        for r in raw_shots_bundle:
            psid = r.get("player_sofascore_id")
            if psid and isinstance(psid, int) and psid not in existing_pids_set:
                missing_shot_pids.append(psid)
    except Exception:
        missing_shot_pids = []
    missing_shot_pids = sorted(set(missing_shot_pids))
    # Attempt on-the-fly enrichment for missing shot players (placeholder players) ONLY if browser provided
    if missing_shot_pids and browser is not None:
        placeholder_players: List[Dict[str, Any]] = []
        for pid in missing_shot_pids:
            try:
                detail = browser.fetch_data(f"player/{pid}") or {}
                pobj = detail.get("player") if isinstance(detail, dict) else detail
                if isinstance(pobj, dict):
                    placeholder_players.append({
                        "sofascore_id": pid,
                        "full_name": pobj.get("name") or pobj.get("shortName") or f"Player {pid}",
                        "position": (pobj.get("position") or "?")[:3],
                        # team_id left blank; may backfill later via other occurrences
                    })
                else:
                    placeholder_players.append({
                        "sofascore_id": pid,
                        "full_name": f"Player {pid}",
                        "position": None,
                    })
            except Exception:
                placeholder_players.append({
                    "sofascore_id": pid,
                    "full_name": f"Player {pid}",
                    "position": None,
                })
        if placeholder_players:
            try:
                logger.info(f"[store][shots] enriching missing shot players count={len(placeholder_players)} pids={missing_shot_pids[:8]}")
                # Attempt to fetch details for placeholders (nationality, height, dob)
                try:
                    if browser is not None:
                        enrich_player_details(browser, placeholder_players, throttle=throttle)
                except Exception:
                    pass
                db.upsert_players(placeholder_players)
                # refresh player_map with new inserts
                try:
                    player_map = db.get_player_ids_by_sofa([p.get("sofascore_id") for p in bundle.get("players", [])] + missing_shot_pids)
                except Exception:
                    pass
            except Exception:
                pass
    # Assist fallback maps (build once from events)
    assist_by_min_scorer: Dict[tuple, int] = {}
    assist_by_scorer_only: Dict[int, int] = {}
    try:
        event_goal_assists = [er for er in bundle.get("events", []) if er.get("event_type") in {"goal","own_goal"}]
        scorer_goal_minutes: Dict[int, List[int]] = {}
        scorer_assist_candidates: Dict[int, List[int]] = {}
        for er in event_goal_assists:
            sp = er.get("player_sofascore_id")
            ap = er.get("assist_player_sofascore_id")
            mn = er.get("minute")
            if sp and mn is not None and ap:
                try:
                    key = (int(mn), int(sp))
                    assist_by_min_scorer.setdefault(key, int(ap))
                    scorer_goal_minutes.setdefault(int(sp), []).append(int(mn))
                    scorer_assist_candidates.setdefault(int(sp), []).append(int(ap))
                except Exception:
                    pass
        # If scorer has exactly one assist candidate across their goals, keep a scorer-only fallback
        for sp, assists in scorer_assist_candidates.items():
            uniq = sorted(set(a for a in assists if a))
            if len(uniq) == 1:
                assist_by_scorer_only[sp] = uniq[0]
    except Exception:
        pass
    for r in bundle.get("shots", []) or []:
        eid = r.get("source_event_id")
        mid = se_to_mid_sid.get(eid)
        if not mid:
            continue
        sr = dict(r)
        sr["match_id"] = mid
        # Resolve side
        side = sr.get("team_side") or sr.get("side") or sr.get("team")
        if not sr.get("team_id") and side and str(eid) in side_team_cache:
            maybe_team = side_team_cache[str(eid)].get(side)
            if maybe_team:
                sr["team_id"] = maybe_team
        # Map players
        pid = sr.pop("player_sofascore_id", None)
        if pid and pid in player_map:
            sr["player_id"] = player_map[pid]
        apid = sr.pop("assist_player_sofascore_id", None)
        if apid and apid in player_map:
            sr["assist_player_id"] = player_map[apid]
        # Legacy/key variance: ako ShotsProcessor stavlja assist_player_sofascore_id u drugom ključu
        if not sr.get("assist_player_id") and sr.get("assistPlayerSofascoreId") in player_map:
            try:
                sr["assist_player_id"] = player_map[sr.get("assistPlayerSofascoreId")]
            except Exception:
                pass
        # Goal assist fallback: if goal and still missing assist, try minute+scorer match first
        try:
            if sr.get("outcome") == "goal" and not sr.get("assist_player_id") and pid:
                mn = r.get("minute")
                if mn is not None:
                    ap_fallback = assist_by_min_scorer.get((int(mn), int(pid)))
                    if not ap_fallback:
                        # +/-1..3 fuzzy search
                        for delta in (1,-1,2,-2,3,-3):
                            ap_fallback = assist_by_min_scorer.get((int(mn)+delta, int(pid)))
                            if ap_fallback:
                                break
                    if not ap_fallback:
                        ap_fallback = assist_by_scorer_only.get(int(pid))
                    if ap_fallback and ap_fallback in player_map:
                        sr["assist_player_id"] = player_map[ap_fallback]
        except Exception:
            pass
        # ensure source_item_id exists (ShotsProcessor should set it; fallback if absent)
        if "source_item_id" not in sr or sr.get("source_item_id") is None:
            _sid_missing += 1
            # deterministic fallback: enumerate current length for uniqueness within batch
            sr["source_item_id"] = len(sh_rows)
        else:
            _sid_present += 1
        sh_rows.append(sr)
    if sh_rows:
        try:
            # Pre-log drop risk counts (player_id or coords/minute missing)
            risk_missing_player = sum(1 for x in sh_rows if not x.get("player_id"))
            risk_missing_minute = sum(1 for x in sh_rows if x.get("minute") is None)
            risk_missing_xy = sum(1 for x in sh_rows if x.get("x") is None or x.get("y") is None)
            logger.info(
                f"[store][shots] prepared rows={len(sh_rows)} source_item_id_present={_sid_present} missing_filled={_sid_missing} risk_missing_player={risk_missing_player} risk_missing_minute={risk_missing_minute} risk_missing_xy={risk_missing_xy} enriched_missing_players={len(missing_shot_pids)}"
            )
        except Exception:
            pass
        counts["shots"] = db.upsert_shots(sh_rows)

    # 10) Average positions -------------------------------------------------
    ap_raw = bundle.get("average_positions", []) or []
    ap_rows: List[Dict[str, Any]] = []
    # Build quick index from player_id->team_id via lineups and player_stats already mapped
    player_team_hint: Dict[str, str] = {}
    try:
        for lr in line_rows:
            if lr.get("player_id") and lr.get("team_id"):
                player_team_hint[lr["player_id"]] = lr["team_id"]
    except Exception:
        pass
    try:
        for pr in ps_rows:
            if pr.get("player_id") and pr.get("team_id") and pr.get("player_id") not in player_team_hint:
                player_team_hint[pr["player_id"]] = pr["team_id"]
    except Exception:
        pass
    for r in ap_raw:
        eid = r.get("source_event_id")
        mid = se_to_mid_sid.get(eid)
        if not mid:
            continue
        ar = {k: v for k, v in r.items() if k != "source_event_id"}
        ar["match_id"] = mid
        psid = r.get("player_sofascore_id")
        pid_uuid = None
        if psid and psid in player_map:
            pid_uuid = player_map[psid]
            ar["player_id"] = pid_uuid
        # team side inference not included in avg positions raw; attempt via lineup cache if present
        # if we have a lineup row for this (match_id, player_id) we could later backfill team_id; for now infer via side_team_cache using embedded side if present
        side = r.get("side")
        if side and str(eid) in side_team_cache:
            maybe_team = side_team_cache[str(eid)].get(side)
            if maybe_team:
                ar["team_id"] = maybe_team
        # fallback via player_team_hint
        if not ar.get("team_id") and pid_uuid and pid_uuid in player_team_hint:
            ar["team_id"] = player_team_hint[pid_uuid]
        ap_rows.append(ar)
    if ap_rows:
        logger.debug(f"[store] avg_positions in={len(ap_raw)} mapped={len(ap_rows)} sample={ap_rows[:1]}")
        counts["average_positions"] = db.upsert_average_positions(ap_rows)

    # 11) Player stats ------------------------------------------------------
    ps_raw = bundle.get("player_stats", []) or []
    ps_rows: List[Dict[str, Any]] = []
    for r in ps_raw:
        eid = r.get("source_event_id")
        mid = se_to_mid_sid.get(eid)
        if not mid:
            continue
        pr = {k: v for k, v in r.items() if k != "source_event_id"}
        pr["match_id"] = mid
        # Map player id
        psid = r.get("player_sofascore_id")
        if psid and psid in player_map:
            pr["player_id"] = player_map[psid]
        # Map team side / sofascore id -> team_id
        tsid = r.get("team_sofascore_id")
        if tsid and tsid in team_map:
            pr["team_id"] = team_map.get(tsid)
        elif r.get("team") and str(eid) in side_team_cache:
            maybe_team = side_team_cache[str(eid)].get(r.get("team"))
            if maybe_team:
                pr["team_id"] = maybe_team
        ps_rows.append(pr)
    if ps_rows:
        logger.debug(f"[store] player_stats in={len(ps_raw)} mapped={len(ps_rows)} sample={ps_rows[:1]}")
        counts["player_stats"] = db.upsert_player_stats(ps_rows)

    # 12) Match stats -------------------------------------------------------
    ms_raw = bundle.get("match_stats", []) or []
    ms_rows: List[Dict[str, Any]] = []
    for r in ms_raw:
        eid = r.get("source_event_id")
        mid = se_to_mid_sid.get(eid)
        if not mid:
            continue
        mr = {k: v for k, v in r.items() if k != "source_event_id"}
        mr["match_id"] = mid
        # Map team side -> team_id
        if r.get("team") and str(eid) in side_team_cache:
            maybe_team = side_team_cache[str(eid)].get(r.get("team"))
            if maybe_team:
                mr["team_id"] = maybe_team
        ms_rows.append(mr)
    if ms_rows:
        logger.debug(f"[store] match_stats in={len(ms_raw)} mapped={len(ms_rows)} sample={ms_rows[:1]}")
        counts["match_stats"] = db.upsert_match_stats(ms_rows)

    # 13) Standings ---------------------------------------------------------
    std_rows = bundle.get("standings", []) or []
    if std_rows:
        # Refresh maps in case competitions/teams were added earlier in this call (defensive)
        if comps:
            comp_map = db.get_competition_ids_by_sofa([c.get("sofascore_id") for c in comps])
        if teams:
            team_map = db.get_team_ids_by_sofa([t.get("sofascore_id") for t in teams])
        missing_comp_sofa = set()
        missing_team_sofa = set()
        mapped_std: List[Dict[str, Any]] = []
        pre_rows = len(std_rows)
        for r in std_rows:
            comp_sofa = r.get("competition_sofascore_id") or r.get("competition_id")
            team_sofa = r.get("team_sofascore_id") or r.get("team_id")
            comp_uuid = comp_map.get(comp_sofa)
            team_uuid = team_map.get(team_sofa)
            if not comp_uuid:
                missing_comp_sofa.add(comp_sofa)
            if not team_uuid:
                missing_team_sofa.add(team_sofa)
            if not (comp_uuid and team_uuid):
                continue
            nr = dict(r)
            nr["competition_id"] = comp_uuid
            nr["team_id"] = team_uuid
            nr.pop("competition_sofascore_id", None)
            nr.pop("team_sofascore_id", None)
            mapped_std.append(nr)
        if missing_comp_sofa:
            logger.debug(f"[store][standings] missing competitions sofascore={list(missing_comp_sofa)[:5]} count={len(missing_comp_sofa)}")
        if missing_team_sofa:
            logger.debug(f"[store][standings] missing teams sofascore={list(missing_team_sofa)[:5]} count={len(missing_team_sofa)}")
        if mapped_std:
            logger.debug(f"[store] standings in={len(std_rows)} mapped={len(mapped_std)} sample={mapped_std[:1]}")
            counts["standings"] = db.upsert_standings(mapped_std)
        else:
            logger.debug(f"[store][standings] dropped_all pre={pre_rows} mapped=0 (missing_comp={len(missing_comp_sofa)} missing_team={len(missing_team_sofa)})")
            # Extra verbose diagnostics: show a sample original row so we can inspect sofascore ids
            if std_rows:
                logger.debug(f"[store][standings] sample_original={std_rows[0]}")

    # 14) match_managers ----------------------------------------------------
    mm_raw = bundle.get("match_managers", []) or []
    mm_rows: List[Dict[str, Any]] = []
    if mm_raw:
        # Batch map managers instead of per-row query
        mgr_sofas = [r.get("manager_sofascore_id") or r.get("manager_id") for r in mm_raw if r.get("manager_sofascore_id") or r.get("manager_id")]
        mgr_map: Dict[int, str] = {}
        if mgr_sofas:
            try:
                mgr_map = db.get_manager_ids_by_sofa(mgr_sofas)
            except Exception:
                mgr_map = {}
        for r in mm_raw:
            eid = r.get("source_event_id")
            mid = se_to_mid_sid.get(eid)
            if not mid:
                continue
            mgr_sofa = r.get("manager_sofascore_id") or r.get("manager_id")
            team_sofa = r.get("team_sofascore_id") or r.get("team_id")
            mgr_uuid = mgr_map.get(mgr_sofa)
            team_uuid = team_map.get(team_sofa) if team_sofa in team_map else None
            if not mgr_uuid:
                continue
            row = {
                "match_id": mid,
                "manager_id": mgr_uuid,
                "team_id": team_uuid,
                "side": r.get("side"),
            }
            mm_rows.append(row)
    if mm_rows:
        logger.debug(f"[store] match_managers in={len(mm_raw)} mapped={len(mm_rows)} sample={mm_rows[:1]}")
        counts["match_managers"] = db.upsert_match_managers(mm_rows)

    # Final diagnostic summary so caller logs always show what we actually persisted
    try:
        logger.info("[store][summary] " + ", ".join(f"{k}={counts.get(k)}" for k in sorted(counts.keys())))
    except Exception:
        pass

    return counts
