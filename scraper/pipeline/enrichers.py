from __future__ import annotations
from typing import Any, Dict
import os
import time
import requests
from datetime import datetime, timezone
from utils.logger import get_logger

logger = get_logger(__name__)

# Single-event enrichment split out of legacy script.

def enrich_event(browser: Any, event: Dict[str, Any], throttle: float = 0.0) -> Dict[str, Any]:
    eid = event.get("id")
    enriched: Dict[str, Any] = {"event": event, "event_id": eid}
    if not eid:
        return enriched
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
                    r = requests.get(url, headers=HEADERS, timeout=15)
                    r.raise_for_status()
                    js = r.json() if r.text else {}
                    if isinstance(js, dict):
                        return js.get("statistics") or {}
                except Exception as ex:
                    logger.debug(f"[enrich_player_stat_fetch_fail] ev={ev_id} pid={player_id} err={ex}")
                return {}
            use_direct = True  # always on per user request to "samo prihvati od apija"
            for pid in pid_set:
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
            if failed_pids:
                logger.warning(f"[enrich_player_stat_missing] ev={eid} missing_count={len(failed_pids)} pids={failed_pids[:10]}...")
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
