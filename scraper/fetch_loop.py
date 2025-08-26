# scraper/fetch_loop.py
from __future__ import annotations

import asyncio
import os
import sys
import time
import json
from pathlib import Path
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

# Path setup
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "scraper"))

from core.database import db
from core.browser import Browser
from utils.logger import get_logger
from processors import MatchProcessor, stats_processor
from pipeline.enrichers import enrich_event  # unify enrichment with historical pipeline
from pipeline.standings import build_standings  # reuse same standings builder as historical ingest

"""Modernized live fetch loop.

Key changes vs. earlier version:
 1. Single-source enrichment: uses pipeline.enrichers.enrich_event (same as init_match_dataset)
 2. Event categorisation (live / scheduled / finished) with minimal state to avoid reprocessing
 3. Skips re-enriching fully finished events once stored (configurable window)
 4. Added shots & average positions automatically via enrich_event (previous loop missed them)

Env / tuning knobs (optional):
    LIVE_ONLY=1              → only process live events
    FINISHED_GRACE_MIN=10    → how many minutes after finish we still re-check (default 5)
    SCHEDULE_LOOKAHEAD_MIN=180 → scheduled events starting within this many minutes are monitored (default 180)
"""

logger = get_logger(__name__)

class FetchLoop:
    """
    Jednostavan 4-fazni loop: fetch → enrich → process → store
    Posebno pazi da 'enriched' format bude ono što MatchProcessor očekuje.
    """

    def __init__(self, max_events: int = 50):
        # Allow override via env (so you can raise without code change)
        self.max_events = int(os.getenv("MAX_EVENTS", str(max_events)))
        self.browser: Optional[Browser] = None
        # State to avoid repeated heavy work on finished matches
        self._finished_processed: set[int] = set()
        self._last_status: dict[int, str] = {}
        # Configurable behaviour via env
        self.live_only = os.getenv("LIVE_ONLY", "0") in {"1", "true", "True"}
        self.finished_grace_min = int(os.getenv("FINISHED_GRACE_MIN", "5"))  # keep refreshing N minutes after finish
        self.schedule_lookahead_min = int(os.getenv("SCHEDULE_LOOKAHEAD_MIN", "180"))
        # Track when event finished to apply grace
        self._finished_timestamp: dict[int, float] = {}
        # Classification mapping for current cycle (eid -> live|scheduled|finished)
        self._cycle_classification: Dict[int, str] = {}
        # Persistence of finished events across restarts
        state_dir = Path(os.getenv("SCRAPER_STATE_DIR", Path(__file__).resolve().parents[1] / "state"))
        try:
            state_dir.mkdir(parents=True, exist_ok=True)
        except Exception:
            pass
        self._state_file = state_dir / "finished_events.json"
        self._load_finished_state()
        # Live snapshot (all live events minimal) for UI quick display
        self._live_snapshot = []  # type: ignore[list]
        self._live_snapshot_file = Path(os.getenv("LIVE_SNAPSHOT_PATH", Path(__file__).resolve().parents[1] / "state" / "live_snapshot.json"))
        self._last_live_count = 0

    # ------- state persistence -------
    def _load_finished_state(self):  # best-effort
        try:
            if self._state_file.exists():
                data = json.loads(self._state_file.read_text())
                if isinstance(data, dict):
                    fins = data.get("finished")
                    if isinstance(fins, list):
                        self._finished_processed = {int(x) for x in fins if isinstance(x, (int, str)) and str(x).isdigit()}
        except Exception:
            pass

    def _save_finished_state(self):  # best-effort
        try:
            payload = {"finished": sorted(self._finished_processed)}
            self._state_file.write_text(json.dumps(payload))
        except Exception:
            pass

    async def run_cycle(self) -> Dict[str, Any]:
        start = time.time()
        logger.info("🔄 Starting new fetch cycle...")
        try:
            raw_events = await self._fetch_phase()
            if not raw_events:
                logger.info("📭 No events to process")
                return {"success": True, "processed": 0, "stored": 0, "duration": time.time() - start}

            enriched = await self._enrich_phase(raw_events)
            bundle = self._processing_phase(enriched)
            results = await self._storage_phase(bundle)

            dur = time.time() - start
            logger.info(f"✅ Cycle completed in {dur:.2f}s → stored={results.get('total_stored',0)}")
            return {"success": True, "processed": len(enriched), "stored": results.get("total_stored", 0), "duration": dur, "details": results}
        except Exception as e:
            logger.error(f"❌ Fetch cycle failed: {e}")
            return {"success": False, "error": str(e)}
        finally:
            if self.browser:
                try:
                    self.browser.close()
                except:
                    pass
                self.browser = None

    async def _fetch_phase(self) -> List[Dict[str, Any]]:
        """Fetch event shells (no per-event enrichment yet).

        Strategy:
          * Always fetch live events (events/live)
          * Fetch today's scheduled events; keep only ones starting within schedule_lookahead_min
          * Optionally skip scheduled/past if LIVE_ONLY set
          * Avoid reprocessing long-finished events beyond grace window
        """
        logger.info("📡 Phase 1: Fetching raw events...")
        if not self.browser:
            self.browser = Browser()

        def _take_events(payload):
            if not payload:
                return []
            if isinstance(payload, dict) and "events" in payload:
                return payload.get("events") or []
            if isinstance(payload, list):
                return payload
            return []
        out: dict[int, Dict[str, Any]] = {}
        self._cycle_classification = {}
        now_ts = time.time()
        try:
            live_data = self._safe_fetch("events/live")
            # Diagnostics for live fetch
            if isinstance(live_data, dict) and live_data.get("__error__"):
                logger.warning(f"[diag][live_fetch_error] code={live_data.get('__error__')} msg={live_data.get('__msg__')}")
            raw_live_events = 0
            if isinstance(live_data, dict) and isinstance(live_data.get("events"), list):
                raw_live_events = len(live_data.get("events"))
            elif isinstance(live_data, list):
                raw_live_events = len(live_data)
            # Build full live snapshot BEFORE limiting for heavy processing
            full_live_events = _take_events(live_data)
            live_snapshot: List[Dict[str, Any]] = []
            for ev in full_live_events:
                if not isinstance(ev, dict):
                    continue
                eid = ev.get("id")
                if eid is None:
                    continue
                # Add to working set (subject to later max_events trimming)
                if eid not in out:
                    out[eid] = ev
                    self._cycle_classification[eid] = "live"
                # Minimal snapshot row
                try:
                    home = (ev.get("homeTeam") or {})
                    away = (ev.get("awayTeam") or {})
                    status_obj = ev.get("status") or {}
                    minute = None
                    if isinstance(status_obj, dict):
                        minute = status_obj.get("minute") or (status_obj.get("description") if isinstance(status_obj.get("description"), int) else None)
                    live_snapshot.append({
                        "id": eid,
                        "tournamentId": (ev.get("tournament") or {}).get("id"),
                        "categoryId": ((ev.get("tournament") or {}).get("category") or {}).get("id"),
                        "home": {"id": home.get("id"), "name": home.get("name"), "score": (ev.get("homeScore") or {}).get("current")},
                        "away": {"id": away.get("id"), "name": away.get("name"), "score": (ev.get("awayScore") or {}).get("current")},
                        "status": {
                            "type": status_obj.get("type") if isinstance(status_obj, dict) else status_obj,
                            "description": status_obj.get("description") if isinstance(status_obj, dict) else None,
                            "minute": minute,
                        },
                        "startTimestamp": ev.get("startTimestamp"),
                    })
                except Exception:
                    pass
            # Persist snapshot (all live events) even if we later limit heavy work
            try:
                if live_snapshot:
                    self._live_snapshot = live_snapshot
                    self._last_live_count = len(live_snapshot)
                    self._live_snapshot_file.parent.mkdir(parents=True, exist_ok=True)
                    self._live_snapshot_file.write_text(json.dumps({
                        "generatedAt": int(time.time()),
                        "count": len(live_snapshot),
                        "events": live_snapshot
                    }), encoding="utf-8")
                    logger.info(f"[live_snapshot] total_live={len(live_snapshot)} saved='{self._live_snapshot_file.name}' (heavy_processing_cap={self.max_events})")
                else:
                    logger.info("[live_snapshot] no live events")
            except Exception as ex:
                logger.warning(f"[live_snapshot][write_fail] err={ex}")
            if raw_live_events and raw_live_events != sum(1 for _, cls in self._cycle_classification.items() if cls == "live"):
                logger.info(f"[diag][live_count_mismatch] raw_list={raw_live_events} distinct_ids={sum(1 for _, cls in self._cycle_classification.items() if cls=='live')} duplicates={raw_live_events - sum(1 for _, cls in self._cycle_classification.items() if cls=='live')}")

            if not self.live_only:
                today = datetime.now(timezone.utc).date().isoformat()
                sched = self._safe_fetch(f"scheduled-events/{today}")
                for ev in _take_events(sched):
                    if not isinstance(ev, dict):
                        continue
                    eid = ev.get("id")
                    if eid is None:
                        continue
                    # Keep only if starts soon enough
                    starts = ev.get("startTimestamp") or ev.get("startTime")
                    if starts:
                        try:
                            if isinstance(starts, (int, float)):
                                mins_to_kick = (starts - now_ts) / 60.0
                                if mins_to_kick > self.schedule_lookahead_min:
                                    continue
                        except Exception:
                            pass
                    out[eid] = ev
                    self._cycle_classification[eid] = "scheduled"

            filtered: List[Dict[str, Any]] = []
            live_cnt = 0
            scheduled_cnt = 0
            finished_cnt = 0
            for eid, ev in out.items():
                status = ((ev.get("status") or {}).get("type")) if isinstance(ev.get("status"), dict) else (ev.get("status"))
                if isinstance(status, dict):
                    status = status.get("type")
                if isinstance(status, str):
                    self._last_status[eid] = status
                finished = str(status).lower() in {"finished", "after overtime", "after penalties", "ft"}
                if finished and eid not in self._finished_timestamp:
                    self._finished_timestamp[eid] = now_ts
                if finished:
                    grace_passed = (now_ts - self._finished_timestamp.get(eid, now_ts)) / 60.0 > self.finished_grace_min
                    if grace_passed and eid in self._finished_processed:
                        continue
                    self._cycle_classification[eid] = "finished"
                    finished_cnt += 1
                else:
                    cls = self._cycle_classification.get(eid)
                    if cls == "live":
                        live_cnt += 1
                    elif cls == "scheduled":
                        scheduled_cnt += 1
                filtered.append(ev)

            if len(filtered) > self.max_events:
                limited_from = len(filtered)
                filtered = filtered[: self.max_events]
                logger.info(f"⚡ Limited to {self.max_events} events (from {limited_from}) – increase MAX_EVENTS env to raise cap")
            logger.info(f"📦 Fetched {len(filtered)} raw events | live_total={self._last_live_count} live_processed={live_cnt} scheduled_processed={scheduled_cnt} finished_processed={finished_cnt}")
            return filtered
        except Exception as e:
            logger.error(f"❌ Fetch failed: {e}")
            return []

    async def _enrich_phase(self, raw_events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Phase 2: Enrich events using unified enrich_event (same as historical ingest)."""
        logger.info(f"🔍 Phase 2: Enriching {len(raw_events)} events (unified)...")
        enriched: List[Dict[str, Any]] = []
        now_ts = time.time()
        for i, ev in enumerate(raw_events):
            try:
                ev_id = self._extract_event_id(ev)
                if not ev_id:
                    continue
                cls = self._cycle_classification.get(ev_id)
                starts = ev.get("startTimestamp") or ev.get("startTime")
                mins_to_kick = None
                if isinstance(starts, (int, float)):
                    mins_to_kick = (starts - now_ts) / 60.0
                status = (ev.get("status") or {}).get("type") if isinstance(ev.get("status"), dict) else ev.get("status")
                status_l = str(status).lower() if status else ""
                finished_like = status_l in {"finished", "after overtime", "after penalties", "ft"}
                heavy = True  # default
                if cls == "scheduled" and mins_to_kick is not None and mins_to_kick > self.schedule_lookahead_min:
                    heavy = False
                if finished_like:
                    fin_ts = self._finished_timestamp.get(ev_id)
                    if fin_ts and (time.time() - fin_ts)/60.0 > self.finished_grace_min:
                        heavy = False
                enriched.append(enrich_event(self.browser, ev, heavy=heavy))
            except Exception as e:
                logger.warning(f"⚠️ Enrich failed eid={ev.get('id')} idx={i}: {e}")
        logger.info(f"✅ Enriched {len(enriched)} events")
        try:
            heavy_count = sum(1 for e in enriched if e.get("_raw_shots") or e.get("statistics") or e.get("events"))
            light_count = len(enriched) - heavy_count
            logger.info(f"🧪 Enrichment split: heavy={heavy_count} light={light_count}")
        except Exception:
            pass
        return enriched

    def _processing_phase(self, enriched_events: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
        logger.info(f"⚙️ Phase 3: Processing {len(enriched_events)} enriched events...")
        try:
            mp = MatchProcessor()
            bundle = mp.process(enriched_events)

            # Convert match-level stats (enrich_event stores under 'statistics')
            all_match_stats, all_player_stats = [], []
            for ee in enriched_events:
                eid = ee.get("event_id")
                if ee.get("statistics"):
                    all_match_stats.extend(stats_processor.process_match_stats(ee["statistics"], eid))
                # Player stats: still optional; rely on per-player enrichment inside enrich_event if needed

            if all_match_stats:
                bundle["match_stats"] = all_match_stats
            if all_player_stats:
                bundle["player_stats"] = all_player_stats

            # log
            for k in ("competitions", "teams", "players", "matches", "lineups", "formations", "events", "player_stats", "match_stats"):
                logger.info(f"   • {k}: {len(bundle.get(k, []))}")

            # Build standings opportunistically: only if we processed some matches
            try:
                if bundle.get("matches"):
                    std_rows = build_standings(self.browser, enriched_events)
                    if std_rows:
                        bundle["standings"] = std_rows
                        logger.info(f"   • standings: {len(std_rows)} (added)")
                    else:
                        logger.debug("[standings] none built this cycle")
            except Exception as e:
                logger.debug(f"[standings] build error skipped: {e}")
            return bundle
        except Exception as e:
            import traceback
            logger.error(f"❌ Processing phase failed: {e}")
            logger.error(traceback.format_exc())
            return {k: [] for k in ("competitions","teams","players","matches","lineups","formations","events","player_stats","match_stats")}

    async def _storage_phase(self, bundle: Dict[str, List[Dict[str, Any]]]) -> Dict[str, Any]:
        logger.info("💾 Phase 4: Storing in database...")
        res: Dict[str, Any] = {}
        total = 0

        try:
            comps = bundle.get("competitions", [])
            if comps:
                ok, fail = db.upsert_competitions(comps)
                res["competitions"] = {"ok": ok, "fail": fail}; total += ok
                logger.info(f"✅ competitions: ok={ok}, fail={fail}")

            teams = bundle.get("teams", [])
            if teams:
                ok, fail = db.upsert_teams(teams)
                res["teams"] = {"ok": ok, "fail": fail}; total += ok
                logger.info(f"✅ teams:        ok={ok}, fail={fail}")

            # mappings
            team_map = db.get_team_ids_by_sofa([t["sofascore_id"] for t in teams]) if teams else {}
            comp_map: Dict[Any, Any] = {}
            if comps:
                try:
                    client = getattr(db, "client", None)
                    if client:
                        ids = [c["sofascore_id"] for c in comps]
                        q = client.table("competitions").select("id,sofascore_id").in_("sofascore_id", ids).execute()
                        comp_map = {r["sofascore_id"]: r["id"] for r in (q.data or [])}
                except Exception as e:
                    logger.warning(f"⚠️ competition mapping failed: {e}")

            # players → team backfill: assign team_id to players based on lineups
            # Only run if we have both teams and players and at least one lineup
            lineups_for_backfill = bundle.get("lineups", [])
            players_for_team_update: List[Dict[str, Any]] = []
            if team_map and lineups_for_backfill:
                for r in lineups_for_backfill:
                    ts = r.get("team_sofascore_id")
                    ps = r.get("player_sofascore_id")
                    if ts and ps and ts in team_map:
                        players_for_team_update.append({
                            "sofascore_id": ps,
                            "team_id": team_map[ts],
                        })
            if players_for_team_update:
                try:
                    ok_upd, fail_upd = db.backfill_players_team(players_for_team_update)
                    logger.info(f"✅ player team backfill: updated={ok_upd}, skipped={fail_upd}")
                except Exception as e:
                    logger.warning(f"⚠️ player team backfill failed: {e}")

            # players must be inserted before matches so that we can map
            # player_ids for lineups and statistics.  Upsert them here.
            players = bundle.get("players", [])
            if players:
                ok, fail = db.upsert_players(players)
                res["players"] = {"ok": ok, "fail": fail}; total += ok
                logger.info(f"✅ players:      ok={ok}, fail={fail}")

            # matches
            matches = bundle.get("matches", [])
            if matches:
                for m in matches:
                    if (cid := m.get("competition_sofascore_id")) in comp_map:
                        m["competition_id"] = comp_map[cid]
                    if (hs := m.get("home_team_sofascore_id")) in team_map:
                        m["home_team_id"] = team_map[hs]
                    if (as_ := m.get("away_team_sofascore_id")) in team_map:
                        m["away_team_id"] = team_map[as_]
                ok, fail = db.batch_upsert_matches(matches)
                res["matches"] = {"ok": ok, "fail": fail}; total += ok
                logger.info(f"✅ matches:      ok={ok}, fail={fail}")

                # Build / upsert live match_state snapshot for these matches (only if we have source ids mapped afterwards)
                try:
                    # We'll fill match_id after we build map (requires DB ids). So temporarily store raw snapshot intents.
                    match_state_intents: List[Dict[str, Any]] = []
                    for m in matches:
                        # skip if obviously not live-ish and no minute change (still allow finished for final snapshot)
                        state_row = {
                            "_src": m.get("source"),
                            "_sid": m.get("source_event_id"),
                            "status": m.get("status"),
                            "status_type": m.get("status_type") or m.get("status"),
                            "minute": m.get("minute"),
                            "home_score": m.get("home_score"),
                            "away_score": m.get("away_score"),
                            # updated_at left for DB trigger; we can still send a value
                            "updated_at": datetime.utcnow().isoformat(),
                        }
                        match_state_intents.append(state_row)
                except Exception as ex_ms_int:
                    logger.debug(f"[match_state] build intents skipped: {ex_ms_int}")

            # get match map for FKs
            match_map = db.get_match_ids_by_source_ids(
                [(m["source"], m["source_event_id"]) for m in matches if m.get("source") and m.get("source_event_id")]
            ) if matches else {}
            # If we prepared match_state intents, resolve match_id now and upsert
            try:
                if matches:
                    intents = locals().get("match_state_intents") or []
                    ms_rows: List[Dict[str, Any]] = []
                    for it in intents:
                        src = it.get("_src"); sid = it.get("_sid")
                        if src and sid is not None:
                            key = (src, int(sid))
                            mid = match_map.get(key)
                            if mid:
                                row = {k: v for k, v in it.items() if not k.startswith("_")}
                                row["match_id"] = mid
                                ms_rows.append(row)
                    if ms_rows:
                        ms_ok, ms_fail = db.upsert_match_state(ms_rows)
                        res["match_state"] = {"ok": ms_ok, "fail": ms_fail}; total += ms_ok
                        logger.info(f"✅ match_state:  ok={ms_ok}, fail={ms_fail}")
            except Exception as ex_ms:
                logger.debug(f"[match_state] upsert skipped: {ex_ms}")
            player_map = db.get_player_ids_by_sofa(
                [p["sofascore_id"] for p in bundle.get("players", [])]
            ) if bundle.get("players") else {}

            # Build a quick side→team_id map for this batch, keyed by (source, source_event_id, side)
            side_team_map: Dict[Tuple[str, int, str], str] = {}
            if matches:
                for m in matches:
                    try:
                        src = m.get("source")
                        sid = int(m.get("source_event_id")) if m.get("source_event_id") is not None else None
                    except Exception:
                        src, sid = None, None
                    if not src or sid is None:
                        continue
                    if m.get("home_team_id"):
                        side_team_map[(src, sid, "home")] = m["home_team_id"]
                    if m.get("away_team_id"):
                        side_team_map[(src, sid, "away")] = m["away_team_id"]

            # lineups
            lineups = bundle.get("lineups", [])
            if lineups:
                for r in lineups:
                    tup = (r.get("source"), r.get("source_event_id"))
                    if tup in match_map:
                        r["match_id"] = match_map[tup]
                    if (ts := r.get("team_sofascore_id")) in team_map:
                        r["team_id"] = team_map[ts]
                    if (ps := r.get("player_sofascore_id")) in player_map:
                        r["player_id"] = player_map[ps]
                ok, fail = db.upsert_lineups(lineups)
                res["lineups"] = {"ok": ok, "fail": fail}; total += ok
                logger.info(f"✅ lineups:      ok={ok}, fail={fail}")

            # formations
            forms = bundle.get("formations", [])
            if forms:
                for r in forms:
                    tup = (r.get("source"), r.get("source_event_id"))
                    if tup in match_map:
                        r["match_id"] = match_map[tup]
                    if (ts := r.get("team_sofascore_id")) in team_map:
                        r["team_id"] = team_map[ts]
                ok, fail = db.upsert_formations(forms)
                res["formations"] = {"ok": ok, "fail": fail}; total += ok
                logger.info(f"✅ formations:   ok={ok}, fail={fail}")

            # events
            mev = bundle.get("events", [])
            if mev:
                for r in mev:
                    tup = (r.get("source"), r.get("source_event_id"))
                    if tup in match_map:
                        r["match_id"] = match_map[tup]
                ok, fail = db.upsert_match_events(mev)
                res["events"] = {"ok": ok, "fail": fail}; total += ok
                logger.info(f"✅ events:       ok={ok}, fail={fail}")

            # player stats
            pstats = bundle.get("player_stats", [])
            if pstats:
                for r in pstats:
                    tup = (r.get("source"), r.get("source_event_id"))
                    if tup in match_map:
                        r["match_id"] = match_map[tup]
                    if (ps := r.get("player_sofascore_id")) in player_map:
                        r["player_id"] = player_map[ps]
                    # Optional: set team_id if we can infer from side
                    side = r.get("team")
                    if side:
                        try:
                            sid = int(r.get("source_event_id")) if r.get("source_event_id") is not None else None
                        except Exception:
                            sid = None
                        src = r.get("source")
                        key = (src, sid, side)
                        if key in side_team_map:
                            r["team_id"] = side_team_map[key]
                ok, fail = db.upsert_player_stats(pstats)
                res["player_stats"] = {"ok": ok, "fail": fail}; total += ok
                logger.info(f"✅ player_stats: ok={ok}, fail={fail}")

            # match stats
            mstats = bundle.get("match_stats", [])
            if mstats:
                for r in mstats:
                    tup = (r.get("source"), r.get("source_event_id"))
                    if tup in match_map:
                        r["match_id"] = match_map[tup]
                    # Map side → team_id based on the match row we just upserted
                    side = r.get("team")
                    if side:
                        try:
                            sid = int(r.get("source_event_id")) if r.get("source_event_id") is not None else None
                        except Exception:
                            sid = None
                        src = r.get("source")
                        key = (src, sid, side)
                        if key in side_team_map:
                            r["team_id"] = side_team_map[key]
                ok, fail = db.upsert_match_stats(mstats)
                res["match_stats"] = {"ok": ok, "fail": fail}; total += ok
                logger.info(f"✅ match_stats:  ok={ok}, fail={fail}")

            # Mark finished events as processed (so we can skip after grace)
            for m in bundle.get("matches", []):
                status = (m.get("status") or "").lower()
                eid = m.get("source_event_id") or m.get("event_id") or m.get("sofascore_event_id")
                if isinstance(eid, str):
                    try:
                        eid = int(eid)
                    except Exception:
                        eid = None
                if eid and status in {"finished", "after overtime", "after penalties", "ft"}:
                    self._finished_processed.add(eid)
            # Persist finished set
            self._save_finished_state()
            res["total_stored"] = total
            return res
        except Exception as e:
            logger.error(f"❌ Storage phase failed: {e}")
            res["total_stored"] = total
            res["error"] = str(e)
            return res

    # ----------------- helpers -----------------
    def _safe_fetch(self, endpoint: str) -> Optional[Dict[str, Any]]:
        if not self.browser:
            return None
        try:
            return self.browser.fetch_data(endpoint)
        except Exception as e:
            logger.warning(f"⚠️ fetch failed for {endpoint}: {e}")
            return None

    def _extract_event_id(self, ev: Dict[str, Any]) -> Optional[int]:
        for k in ("id", "eventId", "sofaEventId"):
            if ev.get(k) is not None:
                try:
                    return int(ev[k])
                except Exception:
                    pass
        return None

    # Legacy parser helpers removed – enrichment now delegated to enrich_event


# ------------- standalone -------------
async def main():
    logger.info("🚀 Starting FetchLoop...")
    db.health_check()
    loop = FetchLoop(max_events=20)
    while True:
        try:
            res = await loop.run_cycle()
            if res.get("success"):
                logger.info(f"📊 processed={res.get('processed')} stored={res.get('stored')}")
            await asyncio.sleep(30)
        except KeyboardInterrupt:
            logger.info("👋 Shutting down...")
            break
        except Exception as e:
            logger.error(f"❌ Unexpected error: {e}")
            await asyncio.sleep(60)

if __name__ == "__main__":
    asyncio.run(main())
