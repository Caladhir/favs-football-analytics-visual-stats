# scraper/fetch_loop.py
from __future__ import annotations

import asyncio
import os
import sys
import time
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple

# Path setup
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "scraper"))

from core.database import db
from core.browser import Browser
from utils.logger import get_logger
from processors import MatchProcessor, stats_processor
from processors.stats_processor import build_player_stats_fallback

logger = get_logger(__name__)

class FetchLoop:
    """
    Jednostavan 4-fazni loop: fetch → enrich → process → store
    Posebno pazi da 'enriched' format bude ono što MatchProcessor očekuje.
    """

    def __init__(self, max_events: int = 50):
        self.max_events = max_events
        self.browser: Optional[Browser] = None

    async def run_cycle(self) -> Dict[str, Any]:
        start = time.time()
        logger.info("🔄 Starting new fetch cycle...")
        try:
            raw_events = await self._fetch_phase()
            if not raw_events:
                logger.info("📭 No events to process")
                return {"success": True, "processed": 0, "stored": 0, "duration": time.time() - start}

            # NEW: light snapshot store (minimal matches) BEFORE heavy enrichment
            # This gives the dashboard quick access to today's matches count without waiting
            # for all detail endpoints (lineups, incidents, stats, etc.). Controlled by env var
            # FAST_SNAPSHOT (default on).
            if os.getenv("FAST_SNAPSHOT", "1").lower() in {"1","true","yes"}:
                try:
                    snap_ok = await self._light_snapshot_store(raw_events)
                    logger.info(f"⚡ Light snapshot stored {snap_ok} minimal matches early")
                except Exception as sx:
                    logger.warning(f"⚠️ Light snapshot phase failed: {sx}")

            # After snapshot we may want to trim for heavy enrichment cost
            max_enrich = int(os.getenv("ENRICH_MAX_EVENTS", str(self.max_events))) if os.getenv("ENRICH_MAX_EVENTS") else self.max_events
            events_for_enrich = list(raw_events)
            if len(events_for_enrich) > max_enrich:
                events_for_enrich = events_for_enrich[:max_enrich]
                logger.info(f"⚡ Enrichment limited to {max_enrich} events (snapshot stored full set)")

            enriched = await self._enrich_phase(events_for_enrich)
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
        logger.info("📡 Phase 1: Fetching raw events...")
        self.browser = Browser()
        out: List[Dict[str, Any]] = []

        def _take_events(payload):
            if not payload:
                return []
            if isinstance(payload, dict) and "events" in payload:
                return payload.get("events") or []
            if isinstance(payload, list):
                return payload
            return []

        try:
            live_data = self._safe_fetch("events/live")
            out += _take_events(live_data)

            # Configurable window: past finished + today + near future scheduled
            past_h = int(os.getenv("FETCH_PAST_HOURS", "12") or 12)
            future_h = int(os.getenv("FETCH_FUTURE_HOURS", "24") or 24)
            now_local = datetime.now()
            # Collect date strings covering window
            dates: set[str] = set()
            # Include today always
            dates.add(now_local.date().isoformat())
            # If future window crosses day boundary include those dates
            for dh in range(0, future_h + 1, 6):  # step 6h
                d = (now_local + timedelta(hours=dh)).date().isoformat()
                dates.add(d)
            # Past dates for finished coverage
            for dh in range(0, past_h + 1, 6):
                d = (now_local - timedelta(hours=dh)).date().isoformat()
                dates.add(d)
            for dstr in sorted(dates):
                try:
                    sched = self._safe_fetch(f"scheduled-events/{dstr}")
                    out += _take_events(sched)
                except Exception:
                    pass

            # (Optional future: explicit finished-events endpoint if available) – for now rely on scheduled list which includes finished when querying past date

            # Do NOT trim here anymore; trimming is now only for enrichment (after snapshot) unless explicitly forced.
            if os.getenv("FORCE_FETCH_TRIM"):
                limit = int(os.getenv("FORCE_FETCH_TRIM", str(self.max_events)))
                if len(out) > limit:
                    out = out[:limit]
                    logger.info(f"⚡ Force-trimmed raw fetch to {limit} events (FORCE_FETCH_TRIM)")

            # Basic breakdown BEFORE any trimming (current code no longer trims here unless FORCE_FETCH_TRIM)
            try:
                live_ct = 0; sched_ct = 0; other_ct = 0; finished_ct = 0
                for ev in out:
                    st_obj = ev.get("status") or {}
                    st_type = (st_obj.get("type") or st_obj.get("description") or ev.get("statusType") or "").lower()
                    if st_type in {"notstarted","not_started","ns","scheduled"}:
                        sched_ct += 1
                    elif st_type in {"live","inprogress","in_progress","ht","halftime"}:
                        live_ct += 1
                    elif st_type in {"finished","after_penalties","ap","ft"}:
                        finished_ct += 1
                    else:
                        other_ct += 1
                logger.info(f"📦 Fetched {len(out)} raw events (live={live_ct} scheduled={sched_ct} finished={finished_ct} other={other_ct})")
            except Exception:
                logger.info(f"📦 Fetched {len(out)} raw events (breakdown error)")
            return out
        except Exception as e:
            logger.error(f"❌ Fetch failed: {e}")
            return []

    async def _light_snapshot_store(self, raw_events: List[Dict[str, Any]]) -> int:
        """Store minimal match rows immediately (fast path).

        We purposely avoid hitting any extra endpoints here; we only use the raw snapshot
        payloads returned by `events/live` and `scheduled-events/{date}`. This keeps latency
        low so the frontend can show today's match count quickly.

        Fields populated: home_team, away_team, start_time, status, competition, source, source_event_id.
        """
        if not raw_events:
            return 0
        minimal: List[Dict[str, Any]] = []
        scheduled_only = os.getenv("SNAPSHOT_SCHEDULED_ONLY", "0").lower() in {"1","true","yes"}
        total_events = len(raw_events)
        scheduled_ids: set[int] = set()
        live_ids: set[int] = set()
        league_counter: Dict[str, int] = {}
        now_iso = datetime.now(timezone.utc).isoformat()
        for ev in raw_events:
            try:
                # Event ID
                ev_id = None
                for k in ("id","eventId","sofaEventId"):
                    if ev.get(k) is not None:
                        try:
                            ev_id = int(ev[k])
                            break
                        except Exception:
                            pass
                if ev_id is None:
                    continue
                # Basic team names
                ht = (ev.get("homeTeam") or {}).get("name") or (ev.get("home") or {}).get("name")
                at = (ev.get("awayTeam") or {}).get("name") or (ev.get("away") or {}).get("name")
                if not ht or not at:
                    continue  # skip incomplete rows
                # Competition / tournament
                comp = (ev.get("tournament") or {}).get("name") or (ev.get("competition") or {}).get("name")
                # Start time (timestamp variants)
                ts_val = ev.get("startTimeUTC") or ev.get("startTime") or ev.get("startTimestamp")
                start_iso = None
                if ts_val is not None:
                    try:
                        if isinstance(ts_val, (int,float)):
                            if ts_val > 10**12:
                                ts_val = ts_val/1000.0
                            start_iso = datetime.utcfromtimestamp(ts_val).replace(tzinfo=timezone.utc).isoformat()
                        elif isinstance(ts_val, str):
                            # Try ISO parse; fallback numeric string -> epoch
                            try:
                                start_iso = datetime.fromisoformat(ts_val.replace("Z","+00:00")).astimezone(timezone.utc).isoformat()
                            except Exception:
                                if ts_val.isdigit():
                                    ts = int(ts_val)
                                    if ts > 10**12:
                                        ts = ts/1000.0
                                    start_iso = datetime.utcfromtimestamp(ts).replace(tzinfo=timezone.utc).isoformat()
                    except Exception:
                        start_iso = None
                status_obj = ev.get("status") or {}
                status_type = status_obj.get("type") or status_obj.get("description") or ev.get("statusType") or "scheduled"
                status_type = str(status_type).lower()
                # Map SofaScore style statuses to our canonical ones lightly
                if status_type in {"notstarted","not_started","ns"}:
                    status_type = "scheduled"
                if status_type == "scheduled":
                    scheduled_ids.add(ev_id)
                elif status_type in {"live","inprogress","in_progress","ht","halftime"}:
                    live_ids.add(ev_id)
                if comp:
                    league_counter[comp] = league_counter.get(comp, 0) + 1
                if scheduled_only and status_type != "scheduled":
                    continue  # skip non-scheduled in scheduled-only mode
                row = {
                    "home_team": ht,
                    "away_team": at,
                    "start_time": start_iso,
                    "status": status_type,
                    "competition": comp,
                    "source": "sofascore",
                    "source_event_id": ev_id,
                    "updated_at": now_iso,
                }
                # If live snapshot already has scores include them
                try:
                    hs = (ev.get("homeScore") or {}).get("current")
                    as_ = (ev.get("awayScore") or {}).get("current")
                    if hs is not None and as_ is not None:
                        row["home_score"] = hs
                        row["away_score"] = as_
                except Exception:
                    pass
                minimal.append(row)
            except Exception:
                continue
        if not minimal:
            return 0
        try:
            ok, fail = db.batch_upsert_matches(minimal)
            if scheduled_only:
                logger.info(
                    f"⚡ Light snapshot (scheduled-only) raw_total={total_events} scheduled_unique={len(scheduled_ids)} live_unique={len(live_ids)} stored={ok} fail={fail}"
                )
            else:
                logger.info(
                    f"⚡ Light snapshot (all) raw_total={total_events} scheduled_unique={len(scheduled_ids)} live_unique={len(live_ids)} stored={ok} fail={fail}"
                )
            # optional compact league listing (top 8)
            if league_counter:
                top_leagues = sorted(league_counter.items(), key=lambda x: x[1], reverse=True)[:8]
                logger.info("🏆 snapshot league sample: " + ", ".join(f"{n}:{c}" for n,c in top_leagues))
            return ok
        except Exception as e:
            logger.warning(f"⚠️ Light snapshot upsert failed: {e}")
            return 0

    async def _enrich_phase(self, raw_events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        logger.info(f"🔍 Phase 2: Enriching {len(raw_events)} events...")
        enriched: List[Dict[str, Any]] = []
        for i, ev in enumerate(raw_events):
            try:
                ev_id = self._extract_event_id(ev)
                if not ev_id:
                    continue
                # 'ev' may be a scheduled-events snapshot. Prefer the full event detail
                # from the event/{id} endpoint when available.
                row = {"event": ev, "event_id": ev_id}
                try:
                    detail = self._safe_fetch(f"event/{ev_id}")
                    if detail:
                        # API may return {'event': {...}} or the object directly
                        row_event = detail.get('event') if isinstance(detail, dict) and isinstance(detail.get('event'), dict) else detail
                        if isinstance(row_event, dict):
                            row['event'] = row_event
                except Exception:
                    # keep original snapshot if detail fetch fails
                    pass

                # lineups (+ formations + team ids)
                lu = self._safe_fetch(f"event/{ev_id}/lineups")
                if lu:
                    row["lineups"] = self._parse_lineups(lu)
                    row["homeFormation"] = self._extract_formation(lu, "home")
                    row["awayFormation"] = self._extract_formation(lu, "away")
                    row["home_team_sofa"] = self._extract_team_id(lu, "home")
                    row["away_team_sofa"] = self._extract_team_id(lu, "away")

                # incidents
                inc = self._safe_fetch(f"event/{ev_id}/incidents")
                if inc:
                    row["events"] = self._parse_incidents(inc)

                # stats (raw – kasnije pretvori StatsProcessor)
                st = self._safe_fetch(f"event/{ev_id}/statistics")
                if st:
                    row["_raw_statistics"] = st

                # Removed deprecated player-statistics endpoint (provider removed / unstable)
                # We now rely on statistics payload + fallback reconstruction (lineups + incidents)
                if os.getenv("LOG_PLAYER_STATS_FETCH_REMOVED", "0").lower() in {"1","true","yes"}:
                    logger.debug(f"[player-stats] skipped deprecated endpoint for event {ev_id}")

                # managers (nije nužno, ali zgodno)
                mgr = self._safe_fetch(f"event/{ev_id}/managers")
                if mgr:
                    row["managers"] = self._parse_managers(mgr)

                enriched.append(row)
            except Exception as e:
                logger.warning(f"⚠️ Enrich failed for event #{i+1}: {e}")
        logger.info(f"✅ Enriched {len(enriched)} events")
        return enriched

    def _processing_phase(self, enriched_events: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
        logger.info(f"⚙️ Phase 3: Processing {len(enriched_events)} enriched events...")
        try:
            mp = MatchProcessor()
            bundle = mp.process(enriched_events)

            # dodatno: pretvori raw stats kroz StatsProcessor
            all_match_stats, all_player_stats = [], []
            fallback_enabled = os.getenv("FALLBACK_PLAYER_STATS", "1").lower() in {"1","true","yes"}
            for ee in enriched_events:
                eid = ee.get("event_id")
                if ee.get("_raw_statistics"):
                    all_match_stats.extend(stats_processor.process_match_stats(ee["_raw_statistics"], eid))
                if ee.get("_raw_player_stats"):
                    all_player_stats.extend(stats_processor.process_player_stats(ee["_raw_player_stats"], eid))
                elif fallback_enabled:
                    # Fallback reconstruction (lineups + incidents)
                    fb = build_player_stats_fallback(ee)
                    if fb:
                        all_player_stats.extend(fb)

            if all_match_stats:
                bundle["match_stats"] = all_match_stats
            if all_player_stats:
                bundle["player_stats"] = all_player_stats

            # log
            for k in ("competitions", "teams", "players", "matches", "lineups", "formations", "events", "player_stats", "match_stats"):
                logger.info(f"   • {k}: {len(bundle.get(k, []))}")
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

            # get match map for FKs
            match_map = db.get_match_ids_by_source_ids(
                [(m["source"], m["source_event_id"]) for m in matches if m.get("source") and m.get("source_event_id")]
            ) if matches else {}
            player_map = db.get_player_ids_by_sofa(
                [p["sofascore_id"] for p in bundle.get("players", [])]
            ) if bundle.get("players") else {}

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
                    if (ts := r.get("team_sofascore_id")) in team_map:
                        r["team_id"] = team_map[ts]
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
                    if (ts := r.get("team_sofascore_id")) in team_map:
                        r["team_id"] = team_map[ts]
                ok, fail = db.upsert_match_stats(mstats)
                res["match_stats"] = {"ok": ok, "fail": fail}; total += ok
                logger.info(f"✅ match_stats:  ok={ok}, fail={fail}")

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

    def _parse_lineups(self, data: Dict[str, Any]) -> Dict[str, List[Dict[str, Any]]]:
        res = {"home": [], "away": []}
        for side in ("home", "away"):
            side_data = data.get(side) or {}
            for row in side_data.get("players") or []:
                pl = row.get("player") or {}
                res[side].append({
                    "player": {"id": pl.get("id"), "name": pl.get("name")},
                    "jerseyNumber": row.get("jerseyNumber"),
                    "position": row.get("position"),
                    "isCaptain": bool(row.get("isCaptain")),
                    "isStarting": bool(row.get("isStarting")),
                })
        return res

    def _extract_formation(self, data: Dict[str, Any], side: str) -> Optional[str]:
        node = data.get(side) or {}
        return node.get("formation")

    def _extract_team_id(self, data: Dict[str, Any], side: str) -> Optional[int]:
        node = data.get(side) or {}
        t = node.get("team") or {}
        return t.get("id")

    def _parse_incidents(self, data: Dict[str, Any]) -> List[Dict[str, Any]]:
        res: List[Dict[str, Any]] = []
        incs = data.get("incidents") or []
        for inc in incs:
            side = "home" if inc.get("isHome") else "away"
            minute = None
            if isinstance(inc.get("time"), dict):
                minute = inc["time"].get("minute")
            minute = minute or inc.get("minute")
            pl = inc.get("player") or {}
            res.append({
                "minute": minute,
                "type": inc.get("incidentType"),
                "team": side,
                "player_name": pl.get("name"),
                "description": inc.get("text"),
                "card_color": inc.get("color"),
            })
        return res

    def _parse_managers(self, data: Dict[str, Any]):
        out = {"home": None, "away": None}
        for side in ("home", "away"):
            m = data.get(side) or data.get(f"{side}Manager")
            if isinstance(m, dict):
                out[side] = {"id": m.get("id"), "name": m.get("name")}
        return out


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
