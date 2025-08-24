from __future__ import annotations
from typing import Dict, List, Any, Tuple
from datetime import datetime
from utils.logger import get_logger
from core.database import db
from .manager_enrichment import enrich_manager_details
from .player_enrichment import enrich_player_details

logger = get_logger(__name__)

# Public API ---------------------------------------------------------------

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
    teams = bundle.get("teams", []) or []
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
                                        year_val = datetime.utcfromtimestamp(ts).year
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
                                if year_val and 1800 <= year_val <= datetime.utcnow().year:
                                    t2["founded"] = year_val
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

    # Maps for FK linking
    comp_map = db.get_competition_ids_by_sofa([c.get("sofascore_id") for c in comps]) if comps else {}
    team_map = db.get_team_ids_by_sofa([t.get("sofascore_id") for t in teams]) if teams else {}

    # 2) Players (inject team_id from team_sofascore_id) ---------------------
    players_raw = bundle.get("players", []) or []
    # placeholder logic is handled earlier in legacy script; just map team ids here
    players: List[Dict[str, Any]] = []
    for p in players_raw:
        p2 = dict(p)
        # normalise birth_date -> date_of_birth if present
        if p2.get("birth_date") and not p2.get("date_of_birth"):
            p2["date_of_birth"] = p2.pop("birth_date")
        tsid = p2.pop("team_sofascore_id", None)
        if tsid is not None and tsid in team_map and not p2.get("team_id"):
            p2["team_id"] = team_map.get(tsid)
        players.append(p2)
    if players:
        if browser is not None:
            enrich_player_details(browser, players, throttle=throttle)
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
        comp_sofa = m2.pop("competition_sofascore_id", None)
        if comp_sofa:
            m2["competition_id"] = comp_map.get(comp_sofa)
        h_sofa = m2.pop("home_team_sofascore_id", None)
        a_sofa = m2.pop("away_team_sofascore_id", None)
        if h_sofa:
            m2["home_team_id"] = team_map.get(h_sofa)
        if a_sofa:
            m2["away_team_id"] = team_map.get(a_sofa)
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

    # 5) Build map (source,source_event_id)->match_id -----------------------
    match_map = db.get_match_ids_by_source_ids([("sofascore", m.get("source_event_id")) for m in match_rows]) if match_rows else {}
    se_to_mid = {sid: mid for ((_, sid), mid) in match_map.items()}

    # Helper per-event side -> team_id
    side_team_cache: Dict[str, Dict[str,str]] = {}
    for m in match_rows:
        sid = m.get("source_event_id")
        if sid in se_to_mid:
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
    for r in line_raw:
        eid = r.get("source_event_id")
        mid = se_to_mid.get(eid)
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
        line_rows.append(pr)
    if line_rows:
        logger.debug(f"[store] lineups in={len(line_raw)} mapped={len(line_rows)} sample={line_rows[:1]}")
        counts["lineups"] = db.upsert_lineups(line_rows)

    # 7) Formations ---------------------------------------------------------
    form_raw = bundle.get("formations", []) or []
    form_rows: List[Dict[str, Any]] = []
    for r in form_raw:
        eid = r.get("source_event_id")
        mid = se_to_mid.get(eid)
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
        mid = se_to_mid.get(eid)
        if not mid:
            continue
        er = dict(r)
        er["match_id"] = mid
        ev_rows.append(er)
    if ev_rows:
        counts["events"] = db.upsert_match_events(ev_rows)

    # 9) Shots --------------------------------------------------------------
    sh_rows: List[Dict[str, Any]] = []
    for r in bundle.get("shots", []) or []:
        eid = r.get("source_event_id")
        mid = se_to_mid.get(eid)
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
        sh_rows.append(sr)
    if sh_rows:
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
        mid = se_to_mid.get(eid)
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
        mid = se_to_mid.get(eid)
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
        mid = se_to_mid.get(eid)
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
            mid = se_to_mid.get(eid)
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

    return counts
