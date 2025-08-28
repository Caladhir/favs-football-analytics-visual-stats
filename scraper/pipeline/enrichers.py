from __future__ import annotations
from typing import Any, Dict
import os
import time
# requests is optional; if not installed per-player direct stats will silently skip
try:  # type: ignore
    import requests  # type: ignore  # noqa: F401
except Exception:  # pragma: no cover
    requests = None  # type: ignore
from datetime import datetime, timezone
from utils.logger import get_logger
from core.config import SOFA_TOURNAMENTS_ALLOW
try:  # optional fallback name-based tracking helper
    from utils.leagues_filter import should_track_competition  # type: ignore
except Exception:  # pragma: no cover
    def should_track_competition(_: dict) -> bool:  # type: ignore
        return False

logger = get_logger(__name__)

# Single-event enrichment split out of legacy script.

def enrich_event(browser: Any, event: Dict[str, Any], throttle: float = 0.0, *, heavy: bool = True) -> Dict[str, Any]:
    """Enrich a single SofaScore event.

    heavy=False mode intentionally skips high-volume / late-availability endpoints
    (lineups, per-player stats, incidents, statistics, shotmap, avg positions)
    to reduce network churn for far-future scheduled matches. Caller (e.g. live
    fetch loop) can re-run later with heavy=True when within a prefetch window
    or once status becomes live / finished.
    """
    eid = event.get("id")
    # Allow-list gating (uniqueTournament id) – skip early if not allowed
    try:
        tour = (event.get("tournament") or {})
        ut = tour.get("uniqueTournament") if isinstance(tour.get("uniqueTournament"), dict) else {}
        utid_val = ut.get("id") if isinstance(ut, dict) else None
        comp_obj = ut if ut else tour
        allow_list_hit = bool(SOFA_TOURNAMENTS_ALLOW and utid_val in SOFA_TOURNAMENTS_ALLOW)
        name_priority_hit = should_track_competition(comp_obj) if comp_obj else False
        if not (allow_list_hit or name_priority_hit):
            # Mark skip reason (prefer explicit allow miss vs name miss)
            reason = "not_in_allow_or_priority"
            return {"event": event, "event_id": eid, "_skip": reason}
    except Exception:
        pass
    enriched: Dict[str, Any] = {"event": event, "event_id": eid}
    if not eid:
        return enriched
    # Status-based gating: only heavy for live or finished (or if caller forced heavy=True explicitly)
    status_type = None
    try:
        st_obj = event.get("status") or {}
        status_type = st_obj.get("type") if isinstance(st_obj, dict) else None
    except Exception:
        status_type = None
    live_like = str(status_type).lower() in {"inprogress","live","in_progress"}
    finished_like = str(status_type).lower() in {"finished","after overtime","after penalties","ft"}
    if heavy and not (live_like or finished_like):
        # Downgrade to light automatically for scheduled/future events
        heavy = False

    if not heavy:
        # Minimal venue backfill attempt (cheap) only
        try:
            ev_obj = enriched.get("event") or {}
            v = ev_obj.get("venue") if isinstance(ev_obj, dict) else None
            if not isinstance(v, dict) or not (v.get("name") or ((v.get("stadium") or {}).get("name"))):
                detail = browser.fetch_data(f"event/{eid}") or {}
                detail_event = detail.get("event") if isinstance(detail, dict) and isinstance(detail.get("event"), dict) else detail
                if isinstance(detail_event, dict):
                    dv = detail_event.get("venue")
                    if isinstance(dv, dict):
                        ev_obj["venue"] = dv
                        enriched["event"] = ev_obj
        except Exception:
            pass
        return enriched
    # --- Ensure we have the canonical event detail from the provider ---
    try:
        detail = browser.fetch_data(f"event/{eid}") or {}
        detail_event = detail.get("event") if isinstance(detail, dict) and isinstance(detail.get("event"), dict) else detail
        if isinstance(detail_event, dict):
            # override base event snapshot with canonical detail so processors see authoritative fields
            enriched["event"] = detail_event
    except Exception:
        pass
    def _fetch(path, key=None, default=None):
        try:
            data = browser.fetch_data(path) or default
            if throttle > 0:
                time.sleep(throttle)
            return data
        except Exception as e:
            logger.debug(f"[enrich_event] fetch fail {path}: {e}")
            return default
    # lineups
    lu = _fetch(f"event/{eid}/lineups", {})
    if isinstance(lu, dict):
        home = lu.get("home") or {}
        away = lu.get("away") or {}
        enriched["lineups"] = {
            "home": (home.get("players") or []),
            "away": (away.get("players") or []),
        }
        enriched["homeFormation"] = home.get("formation") or (home.get("team") or {}).get("formation")
        enriched["awayFormation"] = away.get("formation") or (away.get("team") or {}).get("formation")
        enriched["_raw_lineups"] = lu
        # --- per-player detailed stats enrichment (goals, assists etc.) ---
        try:
            # Collect unique player IDs from both sides (limit to reasonable set)
            pid_set = []
            for side_block in (home, away):
                for pl in (side_block.get("players") or []):
                    pid = (pl.get("player") or {}).get("id")
                    if pid and pid not in pid_set:
                        pid_set.append(pid)
            # Fetch individual statistics and merge into lineup player nodes
            # Mapping to unify keys used later by stats_processor
            def _merge_stats(pl_node, stats_node):
                """Replace lineup statistics with a filtered subset from per-player endpoint.

                We no longer keep the original lineup 'statistics' object (to avoid accidental
                carry-over / corruption). Only store the keys we actually read downstream.
                """
                if not isinstance(pl_node, dict) or not isinstance(stats_node, dict):
                    return
                subset_keys = [
                    "rating","ratingVersions","minutesPlayed","goals","goalAssist",
                    "onTargetScoringAttempt","totalPass","totalTackle","touches"
                ]
                filtered = {k: stats_node.get(k) for k in subset_keys if k in stats_node}
                # Propagate DOB timestamp to player node if available (needed for players.date_of_birth)
                try:
                    if "dateOfBirthTimestamp" in stats_node and isinstance(pl_node.get("player"), dict):
                        pl_player = pl_node.get("player")
                        if pl_player.get("dateOfBirthTimestamp") in (None, ""):
                            pl_player["dateOfBirthTimestamp"] = stats_node.get("dateOfBirthTimestamp")
                except Exception:
                    pass
                # Normalisations (mirror old logic but confined to new dict)
                if "goalAssist" in filtered and "assists" not in filtered:
                    filtered["assists"] = filtered.get("goalAssist")
                if "onTargetScoringAttempt" in filtered and "shotsOnTarget" not in filtered:
                    filtered["shotsOnTarget"] = filtered.get("onTargetScoringAttempt")
                if "totalPass" in filtered and "passes" not in filtered:
                    filtered["passes"] = filtered.get("totalPass")
                if "totalTackle" in filtered and "tackles" not in filtered:
                    filtered["tackles"] = filtered.get("totalTackle")
                pl_node["statistics"] = filtered
                # Anomaly logging (minutes / passes / touches) – just info, no mutation
                try:
                    mp = filtered.get("minutesPlayed")
                    ps = filtered.get("totalPass") or filtered.get("passes")
                    tc = filtered.get("touches")
                    if (isinstance(mp, (int,float)) and mp > 120) or (isinstance(ps, (int,float)) and ps > 120) or (isinstance(tc,(int,float)) and tc > 180):
                        logger.warning(f"[enrich_anom] ev={eid} pid={(pl_node.get('player') or {}).get('id')} mp={mp} passes={ps} touches={tc} raw_keys={list(stats_node.keys())}")
                        if os.getenv("LOG_PER_PLAYER_RAW_ON_ANOM"):
                            logger.warning(f"[enrich_anom_raw] ev={eid} pid={(pl_node.get('player') or {}).get('id')} raw={stats_node}")
                except Exception:
                    pass
            success_pids = set()
            failed_pids = []
            # Direct fetch helper (bypass browser cache, mirror probe tool)
            HEADERS = {
                "Accept": "application/json, text/plain, */*",
                "Referer": "https://www.sofascore.com/",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }
            def _direct_player_stats(ev_id: int, player_id: int) -> Dict[str, Any]:
                url = f"https://www.sofascore.com/api/v1/event/{ev_id}/player/{player_id}/statistics"
                try:
                    if requests is None:
                        return {}
                    r = requests.get(url, headers=HEADERS, timeout=15)  # type: ignore
                    r.raise_for_status()  # type: ignore
                    js = r.json() if r.text else {}  # type: ignore
                    if isinstance(js, dict):
                        return js.get("statistics") or {}
                except Exception as ex:
                    logger.debug(f"[enrich_player_stat_fetch_fail] ev={ev_id} pid={player_id} err={ex}")
                return {}
            # Env flag to allow toggling direct fetch (default on). Set PLAYER_STATS_DIRECT=0 to disable.
            use_direct = os.getenv("PLAYER_STATS_DIRECT", "1") not in {"0", "false", "False"}
            # Pre-filter: identify clear bench unused to skip direct fetch (saves time & reduces warnings)
            def _is_unused_bench(entry: dict) -> bool:
                try:
                    # Heuristics: marked substitute and no minutes / no subbedInTime
                    if entry.get("isSubstitute") or entry.get("substitute"):
                        stats_obj = entry.get("statistics") or {}
                        mp = stats_obj.get("minutesPlayed") or entry.get("minutesPlayed")
                        if (mp in (None, 0)) and not entry.get("subbedInTime") and not entry.get("subbedIn"):
                            return True
                    return False
                except Exception:
                    return False
            bench_skipped: list[int] = []
            # Configure concurrency
            import concurrent.futures
            worker_count = 1
            try:
                worker_count = int(os.getenv("PLAYER_STATS_WORKERS", "8"))
            except Exception:
                worker_count = 8
            selected_pids = []
            for pid in pid_set:
                # locate entry to decide if we skip
                entry_ref = None
                for side_block in (home, away):
                    for pl in (side_block.get("players") or []):
                        if (pl.get("player") or {}).get("id") == pid:
                            entry_ref = pl
                            break
                    if entry_ref:
                        break
                if entry_ref and _is_unused_bench(entry_ref):
                    bench_skipped.append(pid)
                else:
                    selected_pids.append(pid)
            def _fetch_one(pid: int):
                if use_direct:
                    return pid, _direct_player_stats(eid, pid)
                detail = _fetch(f"event/{eid}/player/{pid}/statistics", {}) or {}
                return pid, (detail.get("statistics") if isinstance(detail, dict) else None)
            if worker_count > 1 and selected_pids:
                with concurrent.futures.ThreadPoolExecutor(max_workers=worker_count) as ex:
                    for future in concurrent.futures.as_completed([ex.submit(_fetch_one, pid) for pid in selected_pids]):
                        try:
                            pid, stats_block = future.result()
                        except Exception:
                            pid, stats_block = None, None
                        if not pid:
                            continue
                        if isinstance(stats_block, dict) and stats_block:
                            merged = False
                            for side_block in (home, away):
                                for pl in (side_block.get("players") or []):
                                    if (pl.get("player") or {}).get("id") == pid:
                                        _merge_stats(pl, stats_block)
                                        merged = True
                                        mp = stats_block.get("minutesPlayed")
                                        logger.debug(f"[enrich_player_stat] ev={eid} pid={pid} direct={use_direct} minutes_played={mp} fetch_keys={list(stats_block.keys())}")
                                        break
                                if merged:
                                    break
                            if merged:
                                success_pids.add(pid)
                            else:
                                failed_pids.append(pid)
                        else:
                            failed_pids.append(pid)
            else:
                for pid in selected_pids:
                    if use_direct:
                        stats_block = _direct_player_stats(eid, pid)
                    else:
                        detail = _fetch(f"event/{eid}/player/{pid}/statistics", {}) or {}
                        stats_block = detail.get("statistics") if isinstance(detail, dict) else None
                    if isinstance(stats_block, dict) and stats_block:
                        merged = False
                        for side_block in (home, away):
                            for pl in (side_block.get("players") or []):
                                if (pl.get("player") or {}).get("id") == pid:
                                    _merge_stats(pl, stats_block)
                                    merged = True
                                    mp = stats_block.get("minutesPlayed")
                                    logger.debug(f"[enrich_player_stat] ev={eid} pid={pid} direct={use_direct} minutes_played={mp} fetch_keys={list(stats_block.keys())}")
                                    break
                            if merged:
                                break
                        if merged:
                            success_pids.add(pid)
                        else:
                            failed_pids.append(pid)
                    else:
                        failed_pids.append(pid)
                    if throttle > 0:
                        time.sleep(throttle)
            if failed_pids or bench_skipped:
                msg_parts = [f"ev={eid}"]
                if failed_pids:
                    msg_parts.append(f"missing_active={len(failed_pids)} pids={failed_pids[:10]}...")
                if bench_skipped:
                    msg_parts.append(f"bench_skipped={len(bench_skipped)}")
                logger.warning("[enrich_player_stat_missing] " + " ".join(msg_parts))
            # Extra debug: list any player whose merged minutes look suspicious (>120)
            try:
                for side_lbl, side_block in (("home", home), ("away", away)):
                    for pl in (side_block.get("players") or []):
                        pid = (pl.get("player") or {}).get("id")
                        stats_obj = pl.get("statistics") or {}
                        mp = stats_obj.get("minutesPlayed")
                        if pid in success_pids and isinstance(mp,(int,float)) and mp > 120:
                            logger.warning(f"[enrich_player_stat_minutes_suspicious] ev={eid} pid={pid} minutesPlayed={mp}")
            except Exception:
                pass
        except Exception as e:
            logger.debug(f"[enrich_event] per-player stats enrich fail ev={eid}: {e}")
    # incidents
    inc = _fetch(f"event/{eid}/incidents", [])
    if isinstance(inc, dict):
        inc = inc.get("incidents") or []
    if not isinstance(inc, list):
        inc = []
    enriched["events"] = inc
    # statistics
    stats = _fetch(f"event/{eid}/statistics", {})
    if isinstance(stats, dict):
        enriched["statistics"] = stats
    # managers
    mgr = _fetch(f"event/{eid}/managers", {})
    if isinstance(mgr, dict):
        enriched["managers"] = mgr
    # shots
    shots = _fetch(f"event/{eid}/shotmap") or _fetch(f"event/{eid}/shots") or []
    enriched["_raw_shots"] = shots
    # average positions
    ap = _fetch(f"event/{eid}/average-positions") or _fetch(f"event/{eid}/averagepositions") or {}
    enriched["_raw_avg_positions"] = ap

    # --- ensure venue present by fetching full event detail if missing or incomplete ---
    try:
        need_venue = False
        ev_obj = enriched.get("event") or {}
        v = ev_obj.get("venue") if isinstance(ev_obj, dict) else None
        if not isinstance(v, dict) or not (v.get("name") or ( (v.get("stadium") or {}).get("name") )):
            need_venue = True
        if need_venue:
            detail = _fetch(f"event/{eid}", {}) or {}
            # detail may be {"event": {...}} or already the event object
            detail_event = detail.get("event") if isinstance(detail, dict) and isinstance(detail.get("event"), dict) else detail
            if isinstance(detail_event, dict):
                dv = detail_event.get("venue")
                if isinstance(dv, dict):
                    # merge into original event
                    try:
                        ev_obj["venue"] = dv
                        enriched["event"] = ev_obj
                        if dv.get("name"):
                            logger.debug(f"[enrich_event] venue attached ev={eid} name='{dv.get('name')}'")
                        else:
                            logger.debug(f"[enrich_event] venue structure attached ev={eid} keys={list(dv.keys())}")
                    except Exception:
                        pass
    except Exception as _ven_ex:
        logger.debug(f"[enrich_event] venue enrich fail ev={eid}: {_ven_ex}")
    return enriched
