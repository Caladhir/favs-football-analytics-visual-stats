# scraper/core/database.py
from __future__ import annotations

import time
from typing import List, Dict, Any, Optional, Tuple, Iterable
from datetime import datetime, timezone, timedelta
from collections import Counter

from supabase import create_client, Client
from .config import config
from utils.logger import get_logger

logger = get_logger(__name__)

# ------------------------- status scoring & dedupe -------------------------

_STATUS_PRIO = {
    "finished": 5, "ft": 5,
    "live": 4, "inprogress": 4, "in_progress": 4,
    "ht": 3,
    "postponed": 2, "canceled": 2, "cancelled": 2, "abandoned": 2,
    "scheduled": 1, "upcoming": 1, "notstarted": 1, "not_started": 1,
    None: 0, "": 0,
}
def _status_score(m: Dict[str, Any]) -> int:
    return _STATUS_PRIO.get(str(m.get("status_type") or m.get("status") or "").lower(), 0)

def dedupe_matches(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not rows:
        return rows

    def better(a: Dict[str, Any], b: Dict[str, Any]) -> Dict[str, Any]:
        sa, sb = _status_score(a), _status_score(b)
        if sb != sa:
            return b if sb > sa else a
        ua = a.get("updated_at") or a.get("last_seen_at") or ""
        ub = b.get("updated_at") or b.get("last_seen_at") or ""
        return b if ub > ua else a

    by_src: Dict[Tuple[str, int], Dict[str, Any]] = {}
    by_id: Dict[str, Dict[str, Any]] = {}
    no_keys: List[Dict[str, Any]] = []

    for r in rows:
        src = r.get("source")
        sid = r.get("source_event_id")
        mid = r.get("id")
        if src and sid is not None:
            key = (src, sid)
            keep = by_src.get(key)
            by_src[key] = r if not keep else better(keep, r)
        elif mid:
            keep = by_id.get(mid)
            by_id[mid] = r if not keep else better(keep, r)
        else:
            no_keys.append(r)

    out = list(by_src.values()) + list(by_id.values()) + no_keys
    if len(out) != len(rows):
        logger.info(f"core.database | Dedupe: {len(rows)} -> {len(out)} (-{len(rows) - len(out)})")
    return out

# ------------------------------ cleaning helpers ------------------------------

_ALLOWED = {
    "competitions": {
        "name","country","logo_url","priority","sofascore_id",
    },
    "teams": {
        "name","short_name","country","logo_url","sofascore_id",
        "primary_color","secondary_color","founded","venue","venue_capacity",
    },
    "players": {
        "full_name","position","number","team_id","nationality","age",
        "height_cm","weight_kg","sofascore_id",
    },
    "managers": {
        "full_name","nationality","birth_date","team_id","sofascore_id",
    },
    "matches": {
        "home_team","away_team","home_score","away_score","start_time","status",
        "competition","source","updated_at","minute","status_type",
        "home_color","away_color","current_period_start","competition_id","season",
        "round","venue","league_priority","home_team_id","away_team_id","source_event_id",
    },
    "lineups": {
        "match_id","team_id","player_id","position","jersey_number","is_starting","is_captain",
    },
    "formations": {"match_id","team_id","formation"},
    "match_events": {"match_id","minute","event_type","player_name","team","description"},
    "player_stats": {
        "match_id", "player_id", "team_id",
        "goals", "assists",
        # Shots: legacy `shots` plus granular fields
        "shots", "shots_total", "shots_on_target",
        # Discipline
        "yellow_cards", "red_cards",
        # Other stats
        "passes", "tackles",
        "rating", "minutes_played",
        "is_substitute", "was_subbed_in", "was_subbed_out",
    },
    "match_stats": {
        "match_id","team_id","possession","shots_total","shots_on_target","corners","fouls",
        "offsides","yellow_cards","red_cards","passes","pass_accuracy","xg","xa","saves",
        "updated_at",
    },
    "standings": {
        "competition_id","season","team_id","rank","played","wins","draws","losses",
        "goals_for","goals_against","points","form",
    },
    "match_managers": {"match_id","manager_id","team_id","side"},
}

def _clean_rows(table: str, rows: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    allowed = _ALLOWED[table]
    out = []
    for r in rows:
        if not isinstance(r, dict):
            continue
        cleaned = {k: v for k, v in r.items() if k in allowed and v is not None}
        if cleaned:
            out.append(cleaned)
    return out

# ------------------------------ DB client ------------------------------

class DatabaseClient:
    def __init__(self):
        logger.info("core.database | Initializing Supabase client…")
        self.client: Client = create_client(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY)
        logger.info("core.database | ✅ Supabase ready")

    # --- health/perf ---
    def health_check(self) -> bool:
        try:
            self.client.table("matches").select("id").limit(1).execute()
            logger.info("core.database | ✅ DB connection OK")
            return True
        except Exception as e:
            logger.error(f"core.database | ❌ DB health check failed: {e}")
            return False

    def performance_check(self) -> bool:
        try:
            t0 = time.time()
            self.client.table("matches").select("id").limit(1).execute()
            dt = time.time() - t0
            if dt > 2.0:
                logger.warning(f"core.database | ⚠️ Slow DB response ({dt:.2f}s)")
                return False
            logger.info(f"core.database | ✅ DB perf OK ({dt:.2f}s)")
            return True
        except Exception as e:
            logger.error(f"core.database | DB perf failed: {e}")
            return False

    # --- generic upsert with logging ---
    def _upsert(self, table: str, payload: Any, on_conflict: str, ignore_duplicates: Optional[bool] = None) -> tuple[int, int]:
        if not payload:
            return (0, 0)
        try:
            if isinstance(payload, dict):
                payload = [payload]
            if ignore_duplicates is None:
                resp = self.client.table(table).upsert(payload, on_conflict=on_conflict).execute()
            else:
                resp = self.client.table(table).upsert(payload, on_conflict=on_conflict, ignore_duplicates=ignore_duplicates).execute()
            n = len(resp.data or [])
            return (n, max(0, len(payload) - n))
        except Exception as e:
            logger.exception(f"core.database | Upsert into {table} failed: {e}")
            return (0, len(payload))

    # -------------------- lookup mapping helpers --------------------

    def get_match_ids_by_source_ids(self, pairs: List[Tuple[str, int]]) -> Dict[Tuple[str, int], str]:
        out: Dict[Tuple[str, int], str] = {}
        if not pairs:
            return out
        # group by source (brže i kraći upiti)
        by_src: Dict[str, List[int]] = {}
        for s, sid in pairs:
            by_src.setdefault(s, []).append(int(sid))
        for src, ids in by_src.items():
            ids = sorted(set(ids))
            CHUNK = 200
            for i in range(0, len(ids), CHUNK):
                chunk = ids[i:i+CHUNK]
                res = (self.client.table("matches")
                       .select("id, source, source_event_id")
                       .eq("source", src)
                       .in_("source_event_id", chunk)
                       .execute())
                for row in res.data or []:
                    out[(row["source"], int(row["source_event_id"]))] = row["id"]
        return out

    def _map_generic(self, table: str, key_col: str, ids: Iterable[int]) -> Dict[int, str]:
        out: Dict[int, str] = {}
        vals = sorted(set([int(x) for x in ids if x is not None]))
        if not vals:
            return out
        CHUNK = 300
        for i in range(0, len(vals), CHUNK):
            chunk = vals[i:i+CHUNK]
            res = (self.client.table(table)
                   .select(f"id, {key_col}")
                   .in_(key_col, chunk)
                   .execute())
            for r in res.data or []:
                out[int(r[key_col])] = r["id"]
            missing = [x for x in chunk if x not in out]
            if missing:
                # fallback ako je kolona text (rijetko)
                res2 = (self.client.table(table)
                        .select(f"id, {key_col}")
                        .in_(key_col, [str(x) for x in missing])
                        .execute())
                for r in res2.data or []:
                    try:
                        key = int(r[key_col])
                    except Exception:
                        key = r[key_col]
                    out[key] = r["id"]
        return out

    def get_team_ids_by_sofa(self, sofa_ids: Iterable[int]) -> Dict[int, str]:
        m = self._map_generic("teams", "sofascore_id", sofa_ids)
        logger.info(f"core.database | [teams map] asked={len(set(x for x in sofa_ids if x))} -> mapped={len(m)}")
        return m

    def get_player_ids_by_sofa(self, sofa_ids: Iterable[int]) -> Dict[int, str]:
        m = self._map_generic("players", "sofascore_id", sofa_ids)
        logger.info(f"core.database | [players map] asked={len(set(x for x in sofa_ids if x))} -> mapped={len(m)}")
        return m
    def get_manager_ids_by_sofa(self, sofa_ids: Iterable[int]) -> Dict[int, str]:
        m = self._map_generic("managers", "sofascore_id", sofa_ids)
        logger.info(f"core.database | [managers map] asked={len(set(x for x in sofa_ids if x))} -> mapped={len(m)}")
        return m

    def get_competition_ids_by_sofa(self, sofa_ids: Iterable[int]) -> Dict[int, str]:
        return self._map_generic("competitions", "sofascore_id", sofa_ids)

    # -------------------- upserts per table --------------------

    def upsert_competitions(self, rows: List[Dict[str, Any]]) -> tuple[int, int]:
        clean = _clean_rows("competitions", rows)
        if not clean:
            return (0, 0)

        # dedupe: preferiraj bogatije zapise (npr. s logo_url)
        tmp: Dict[Any, Dict[str, Any]] = {}
        for c in clean:
            key = c.get("sofascore_id") or (c.get("name"), c.get("country"))
            if not key:
                continue
            prev = tmp.get(key)
            if not prev or (c.get("logo_url") and not prev.get("logo_url")) or (c.get("priority") and not prev.get("priority")):
                tmp[key] = c

        payload = list(tmp.values())
        return self._upsert("competitions", payload, on_conflict="sofascore_id")


    def upsert_teams(self, rows: List[Dict[str, Any]]) -> tuple[int, int]:
        clean = _clean_rows("teams", rows)
        if not clean:
            return (0, 0)
        # dedupe by sofascore_id
        tmp: Dict[Any, Dict[str, Any]] = {}
        for t in clean:
            k = t.get("sofascore_id")
            if k is None:
                continue
            tmp[k] = t
        payload = list(tmp.values())
        return self._upsert("teams", payload, on_conflict="sofascore_id")

    def upsert_players(self, rows: List[Dict[str, Any]]) -> tuple[int, int]:
        clean = _clean_rows("players", rows)
        if not clean:
            return (0, 0)
        tmp: Dict[Any, Dict[str, Any]] = {}
        for p in clean:
            k = p.get("sofascore_id")
            if k is None:
                continue
            # preferiraj zapise koji imaju team_id
            prev = tmp.get(k)
            if not prev or (p.get("team_id") and not prev.get("team_id")):
                tmp[k] = p
        payload = list(tmp.values())
        return self._upsert("players", payload, on_conflict="sofascore_id")
    
    def upsert_match_managers(self, rows: List[Dict[str, Any]]) -> tuple[int, int]:
        clean = _clean_rows("match_managers", rows)
        if not clean:
            return (0, 0)
        # ključ: (match_id, manager_id)
        tmp: Dict[Tuple[str, str], Dict[str, Any]] = {}
        for r in clean:
            k = (r.get("match_id"), r.get("manager_id"))
            if not all(k):
                continue
            # zadnji zapis pobjeđuje (npr. ako dodamo team_id/side kasnije)
            tmp[k] = r
        payload = list(tmp.values())
        return self._upsert("match_managers", payload, on_conflict="match_id,manager_id")


    def backfill_players_team(self, items: List[Dict[str, Any]]) -> tuple[int, int]:
        """Upsert samo (sofascore_id, team_id) za popunjavanje FK-a."""
        if not items:
            return (0, 0)
        payload = []
        for it in items:
            sid = it.get("sofascore_id")
            tid = it.get("team_id")
            if sid and tid:
                payload.append({"sofascore_id": sid, "team_id": tid})
        if not payload:
            return (0, 0)
        return self._upsert("players", payload, on_conflict="sofascore_id")

    def upsert_managers(self, rows: List[Dict[str, Any]]) -> tuple[int, int]:
        clean = _clean_rows("managers", rows)
        if not clean:
            return (0, 0)
        tmp: Dict[Any, Dict[str, Any]] = {}
        for m in clean:
            k = m.get("sofascore_id") or (m.get("full_name"), m.get("team_id"))
            if not k:
                continue
            tmp[k] = m
        payload = list(tmp.values())
        # prioritetno po sofascore_id; inače name+team (DB ima unique indeks i za to)
        try:
            return self._upsert("managers", payload, on_conflict="sofascore_id")
        except Exception:
            return self._upsert("managers", payload, on_conflict="full_name,team_id")

    def upsert_lineups(self, rows: List[Dict[str, Any]]) -> tuple[int, int]:
        clean = _clean_rows("lineups", rows)
        if not clean:
            return (0, 0)
        # dedupe (match_id, player_id) i preferiraj startere/captain
        tmp: Dict[Tuple[str, str], Dict[str, Any]] = {}
        for r in clean:
            k = (r.get("match_id"), r.get("player_id"))
            if not all(k):
                continue
            if k not in tmp:
                tmp[k] = r
            else:
                a = tmp[k]; b = r
                score_a = int(bool(a.get("is_starting"))) + int(bool(a.get("is_captain")))
                score_b = int(bool(b.get("is_starting"))) + int(bool(b.get("is_captain")))
                if score_b > score_a:
                    tmp[k] = b
        payload = list(tmp.values())
        return self._upsert("lineups", payload, on_conflict="match_id,player_id")

    def upsert_formations(self, rows: List[Dict[str, Any]]) -> tuple[int, int]:
        clean = _clean_rows("formations", rows)
        if not clean:
            return (0, 0)
        tmp: Dict[Tuple[str, str], Dict[str, Any]] = {}
        for r in clean:
            k = (r.get("match_id"), r.get("team_id"))
            if not all(k):
                continue
            tmp[k] = r
        payload = list(tmp.values())
        return self._upsert("formations", payload, on_conflict="match_id,team_id")

    def upsert_match_events(self, rows: List[Dict[str, Any]]) -> tuple[int, int]:
        clean = _clean_rows("match_events", rows)
        if not clean:
            return (0, 0)
        tmp: Dict[Tuple, Dict[str, Any]] = {}
        for r in clean:
            k = (r.get("match_id"), r.get("minute"), r.get("event_type"), r.get("team"), r.get("player_name"))
            if None in k:
                continue
            tmp[k] = r
        payload = list(tmp.values())
        return self._upsert("match_events", payload, on_conflict="match_id,minute,event_type,team,player_name")

    def upsert_player_stats(self, rows: List[Dict[str, Any]]) -> tuple[int, int]:
        clean = _clean_rows("player_stats", rows)
        if not clean:
            return (0, 0)
        tmp: Dict[Tuple[str, str], Dict[str, Any]] = {}
        for r in clean:
            k = (r.get("match_id"), r.get("player_id"))
            if not all(k):
                continue
            tmp[k] = r
        payload = list(tmp.values())
        return self._upsert("player_stats", payload, on_conflict="match_id,player_id")

    def upsert_match_stats(self, rows: List[Dict[str, Any]]) -> tuple[int, int]:
        clean = _clean_rows("match_stats", rows)
        if not clean:
            return (0, 0)
        tmp: Dict[Tuple[str, str], Dict[str, Any]] = {}
        for r in clean:
            k = (r.get("match_id"), r.get("team_id"))
            if not all(k):
                continue
            tmp[k] = r
        payload = list(tmp.values())
        return self._upsert("match_stats", payload, on_conflict="match_id,team_id")

    def upsert_standings(self, rows: List[Dict[str, Any]]) -> tuple[int, int]:
        clean = _clean_rows("standings", rows)
        if not clean:
            return (0, 0)
        tmp: Dict[Tuple[str, str, str], Dict[str, Any]] = {}
        for r in clean:
            k = (r.get("competition_id"), r.get("season"), r.get("team_id"))
            if not all(k):
                continue
            tmp[k] = r
        payload = list(tmp.values())
        return self._upsert("standings", payload, on_conflict="competition_id,season,team_id")

    # -------------------- matches (batch) --------------------

    def _patch_match(self, row: Dict[str, Any]) -> None:
        src = row.get("source"); sid = row.get("source_event_id")
        if src and sid is not None:
            (self.client.table("matches")
             .update(row)
             .eq("source", src)
             .eq("source_event_id", sid)
             .execute())
            return
        rid = row.get("id")
        if rid:
            self.client.table("matches").update(row).eq("id", rid).execute()
            return
        raise ValueError("Cannot PATCH match without (source,source_event_id) or id")

    def batch_upsert_matches(self, matches: List[Dict[str, Any]], batch_size: int = 50) -> Tuple[int, int]:
        if not matches:
            return (0, 0)

        rows = dedupe_matches(_clean_rows("matches", matches))
        group_src = [m for m in rows if m.get("source") and m.get("source_event_id") is not None]
        group_id  = [m for m in rows if m not in group_src and m.get("id")]
        group_plain = [m for m in rows if m not in group_src and m not in group_id]

        total_ok, total_fail = 0, 0

        def _run_group(chunk_rows: List[Dict[str, Any]], on_conflict: Optional[str]) -> Tuple[int, int]:
            ok = fail = 0
            if not chunk_rows:
                return (0, 0)
            total_batches = (len(chunk_rows) + batch_size - 1) // batch_size
            for i in range(0, len(chunk_rows), batch_size):
                batch = chunk_rows[i:i+batch_size]
                bnum = i // batch_size + 1

                # intra-batch dedupe na ključu upserta
                if on_conflict == "source,source_event_id":
                    tmp: Dict[Tuple[str, int], Dict[str, Any]] = {}
                    for m in batch:
                        k = (m["source"], int(m["source_event_id"]))
                        if k not in tmp or _status_score(m) >= _status_score(tmp[k]):
                            tmp[k] = m
                    batch = list(tmp.values())
                elif on_conflict == "id":
                    tmp: Dict[str, Dict[str, Any]] = {}
                    for m in batch:
                        k = m["id"]
                        if k not in tmp or _status_score(m) >= _status_score(tmp[k]):
                            tmp[k] = m
                    batch = list(tmp.values())

                for attempt in range(3):
                    try:
                        if on_conflict:
                            self._upsert("matches", batch, on_conflict=on_conflict)
                        else:
                            self.client.table("matches").insert(batch).execute()
                        ok += len(batch)
                        logger.info(f"core.database | ✅ matches batch {bnum}/{total_batches}: {len(batch)}")
                        break
                    except Exception as e:
                        msg = str(e)
                        logger.error(f"core.database | ❌ matches batch {bnum} attempt {attempt+1}: {msg}")
                        if attempt < 2:
                            time.sleep((attempt+1) * 2)
                        else:
                            # fallback: pojedinačno
                            for m in batch:
                                try:
                                    if on_conflict:
                                        self._upsert("matches", m, on_conflict=on_conflict)
                                    else:
                                        try:
                                            self.client.table("matches").insert(m).execute()
                                        except Exception:
                                            self._patch_match(m)
                                    ok += 1
                                except Exception as ee:
                                    fail += 1
                                    logger.error(f"core.database | match fail: {m.get('home_team')} vs {m.get('away_team')}: {ee}")
                if i + batch_size < len(chunk_rows):
                    time.sleep(0.2)
            return (ok, fail)

        ok, fail = _run_group(group_src, "source,source_event_id")
        total_ok += ok; total_fail += fail
        ok, fail = _run_group(group_id, "id")
        total_ok += ok; total_fail += fail
        ok, fail = _run_group(group_plain, None)
        total_ok += ok; total_fail += fail

        rate = (total_ok / len(rows) * 100.0) if rows else 0.0
        logger.info(f"core.database | matches upsert done: total={len(rows)} ok={total_ok} fail={total_fail} rate={rate:.1f}%")
        return (total_ok, total_fail)

    # -------------------- maintenance --------------------

    def cleanup_zombie_matches(self, hours_old: int = 3) -> int:
        try:
            now = datetime.now(timezone.utc)
            cutoff = now - timedelta(hours=hours_old)
            res = (self.client.table("matches")
                   .select("id")
                   .in_("status", ["live","ht"])
                   .lt("start_time", cutoff.isoformat())
                   .execute())
            ids = [r["id"] for r in (res.data or [])]
            if not ids:
                return 0
            (self.client.table("matches")
             .update({"status": "finished", "status_type": "finished", "minute": None, "updated_at": now.isoformat()})
             .in_("id", ids).execute())
            logger.info(f"core.database | ✅ zombies finished: {len(ids)}")
            return len(ids)
        except Exception as e:
            logger.warning(f"core.database | cleanup_zombie_matches failed: {e}")
            return 0

    def finish_overdue_upcoming(self, hours_old: int = 3) -> int:
        try:
            now = datetime.now(timezone.utc)
            cutoff = now - timedelta(hours=hours_old)
            statuses = ["upcoming","scheduled","notstarted","not_started","ns"]
            res = (self.client.table("matches")
                   .update({"status":"finished","status_type":"finished","minute":None,"updated_at":now.isoformat()})
                   .in_("status", statuses)
                   .lt("start_time", cutoff.isoformat()).execute())
            updated = len(res.data or [])
            logger.info(f"core.database | ✅ force-finished upcoming: {updated}")
            return updated
        except Exception as e:
            logger.warning(f"core.database | finish_overdue_upcoming failed: {e}")
            return 0

# shared instance
db = DatabaseClient()
