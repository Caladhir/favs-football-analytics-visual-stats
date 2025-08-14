# scraper/core/database.py
from __future__ import annotations

import time
import uuid
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timezone, timedelta
from collections import Counter

from supabase import create_client, Client
from .config import config
from utils.logger import get_logger

logger = get_logger(__name__)

_STATUS_PRIO = {
    "live": 4,
    "inprogress": 4,
    "ht": 3,
    "finished": 2,
    "postponed": 1,
    "canceled": 1,
    "scheduled": 0,
    "notstarted": 0,
    None: -1,
    "": -1,
}

def _status_score(m: Dict[str, Any]) -> int:
    return _STATUS_PRIO.get(str(m.get("status_type") or "").lower(), 0)

def dedupe_matches(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not rows:
        return rows

    latest_by_src = {}
    latest_by_id = {}

    def choose_better(a: Dict[str, Any], b: Dict[str, Any]) -> Dict[str, Any]:
        sa, sb = _status_score(a), _status_score(b)
        if sb > sa: return b
        if sb < sa: return a
        ua = a.get("updated_at") or a.get("last_seen_at") or ""
        ub = b.get("updated_at") or b.get("last_seen_at") or ""
        return b if ub > ua else a

    for r in rows:
        src = r.get("source")
        sid = r.get("source_event_id")
        if src and sid is not None:
            key = (src, sid)
            keep = latest_by_src.get(key)
            latest_by_src[key] = r if not keep else choose_better(keep, r)

    for r in rows:
        src = r.get("source")
        sid = r.get("source_event_id")
        if not (src and sid is not None):
            rid = r.get("id")
            if rid:
                keep = latest_by_id.get(rid)
                latest_by_id[rid] = r if not keep else choose_better(keep, r)

    no_keys = [
        r for r in rows
        if not (r.get("source") and r.get("source_event_id") is not None) and not r.get("id")
    ]

    out = list(latest_by_src.values()) + list(latest_by_id.values()) + no_keys
    if len(out) != len(rows):
        logger.info(f"Dedupe: {len(rows)} -> {len(out)} (-{len(rows) - len(out)})")
    else:
        logger.info("Dedupe: 0 uklonjenih duplikata")
    return out

class DatabaseClient:
    def __init__(self):
        self.client: Client = self._create_client()
        self.competition_cache: Dict[Any, str] = {}

    def _create_client(self) -> Client:
        logger.info("Initializing database client...")
        try:
            client = create_client(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY)
            logger.info("✅ Database client initialized")
            return client
        except Exception as e:
            logger.error(f"❌ Failed to initialize database client: {e}")
            raise

    def health_check(self) -> bool:
        try:
            logger.info("Checking database connection...")
            result = self.client.table("matches").select("id").limit(1).execute()
            ok = result.data is not None
            logger.info("✅ Database connection OK" if ok else "❌ Database connection failed")
            return ok
        except Exception as e:
            logger.error(f"❌ Database connection failed: {e}")
            return False

    def performance_check(self) -> bool:
        try:
            start = time.time()
            result = self.client.table("matches").select("count", count="exact").limit(1).execute()
            elapsed = time.time() - start
            total = getattr(result, "count", 0) or 0
            logger.info(f"DB query time: {elapsed:.2f}s, total matches: {total}")
            if elapsed > 5:
                logger.warning(f"Slow database response ({elapsed:.2f}s)")
            return elapsed < 10
        except Exception as e:
            logger.error(f"Performance check failed: {e}")
            return False

    def _upsert(self, table: str, payload: Any, on_conflict: str, ignore_duplicates: Optional[bool] = None):
        qb = self.client.table(table)
        try:
            if ignore_duplicates is None:
                return qb.upsert(payload, on_conflict=on_conflict).execute()
            else:
                return qb.upsert(payload, on_conflict=on_conflict, ignore_duplicates=ignore_duplicates).execute()
        except TypeError:
            return qb.upsert(payload, on_conflict=on_conflict).execute()

    def _patch_match(self, row: Dict[str, Any]) -> None:
        src = row.get("source")
        sid = row.get("source_event_id")
        if src and sid is not None:
            self.client.table("matches") \
                .update(row) \
                .eq("source", src) \
                .eq("source_event_id", sid) \
                .execute()
            return
        rid = row.get("id")
        if rid:
            self.client.table("matches").update(row).eq("id", rid).execute()
            return
        raise ValueError("Cannot PATCH match without (source, source_event_id) or id")

    def batch_upsert_matches(self, matches: List[Dict[str, Any]], batch_size: int = 50) -> Tuple[int, int]:
        if not matches:
            return 0, 0

        matches = dedupe_matches(matches)

        group_src = [m for m in matches if m.get("source") and m.get("source_event_id") is not None]
        group_id = [m for m in matches if not (m.get("source") and m.get("source_event_id") is not None) and m.get("id")]
        group_plain = [m for m in matches if m not in group_src and m not in group_id]

        total_success = 0
        total_failed = 0

        from collections import Counter
        def _process_group(rows: List[Dict[str, Any]], on_conflict: Optional[str]) -> Tuple[int, int]:
            ok, fail = 0, 0
            if not rows:
                return ok, fail

            total_batches = (len(rows) + batch_size - 1) // batch_size
            for i in range(0, len(rows), batch_size):
                batch = rows[i:i + batch_size]
                batch_num = i // batch_size + 1
                logger.info(f"Processing batch {batch_num}/{total_batches} ({len(batch)} matches)")

                if on_conflict == "source,source_event_id":
                    keys = [(b["source"], b["source_event_id"]) for b in batch]
                    dup_keys = [k for k, c in Counter(keys).items() if c > 1]
                    if dup_keys:
                        logger.warning(f"Batch {batch_num}: found {len(dup_keys)} duplicate keys; shrinking batch")
                        tmp = {}
                        for b in batch:
                            k = (b["source"], b["source_event_id"])
                            if k not in tmp:
                                tmp[k] = b
                            else:
                                tmp[k] = b if _status_score(b) >= _status_score(tmp[k]) else tmp[k]
                        batch = list(tmp.values())

                for attempt in range(3):
                    try:
                        if on_conflict:
                            self._upsert("matches", batch, on_conflict=on_conflict)
                        else:
                            self.client.table("matches").insert(batch).execute()
                        ok += len(batch)
                        logger.info(f"✅ Batch {batch_num}: {len(batch)}/{len(batch)} matches stored")
                        break
                    except Exception as e:
                        msg = str(e)
                        logger.error(f"❌ Batch {batch_num} attempt {attempt + 1} failed: {msg}")
                        if "cannot affect row a second time" in msg.lower() and attempt < 2 and on_conflict:
                            tmp = {}
                            for b in batch:
                                k = (b["source"], b["source_event_id"]) if on_conflict == "source,source_event_id" else b.get("id")
                                if k not in tmp:
                                    tmp[k] = b
                                else:
                                    tmp[k] = b if _status_score(b) >= _status_score(tmp[k]) else tmp[k]
                            batch = list(tmp.values())
                            logger.info(f"Batch {batch_num}: reduced to {len(batch)} after intra-batch dedupe")
                            continue
                        if attempt < 2:
                            wait_time = (attempt + 1) * 2
                            logger.info(f"Waiting {wait_time}s before retry...")
                            time.sleep(wait_time)
                        else:
                            logger.warning(f"Batch {batch_num} failed, trying individual upserts...")
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
                                except Exception as indiv_e:
                                    fail += 1
                                    logger.error(
                                        f"Individual upsert failed: "
                                        f"{m.get('home_team', 'Unknown')} vs {m.get('away_team', 'Unknown')} | {indiv_e}"
                                    )
                if i + batch_size < len(rows):
                    time.sleep(0.3)
            return ok, fail

        ok, fail = _process_group(group_src, on_conflict="source,source_event_id")
        total_success += ok; total_failed += fail

        ok, fail = _process_group(group_id, on_conflict="id")
        total_success += ok; total_failed += fail

        if group_plain:
            logger.warning(f"{len(group_plain)} matches have no stable upsert key; attempting plain insert with fallbacks.")
        ok, fail = _process_group(group_plain, on_conflict=None)
        total_success += ok; total_failed += fail

        success_rate = (total_success / len(matches)) * 100 if matches else 0.0
        logger.info("Batch upsert completed:")
        logger.info(f"  Total matches: {len(matches)}")
        logger.info(f"  Successful: {total_success}")
        logger.info(f"  Failed: {total_failed}")
        logger.info(f"  Success rate: {success_rate:.1f}%")

        if total_failed:
            logger.warning(f"Failed matches: {total_failed} (see logs above for details)")

        return total_success, total_failed

    # ---------- Cleanup / maintenance ----------

    def cleanup_zombie_matches(self, hours_old: int = 3) -> int:
        """LIVE/HT koji traju predugo -> finished (per-row update)"""
        try:
            now = datetime.now(timezone.utc)
            cutoff = now - timedelta(hours=hours_old)
            logger.info(f"Cleaning zombie matches older than {hours_old}h...")
            res = self.client.table("matches").select(
                "id"
            ).in_("status", ["live", "ht"]).lt("start_time", cutoff.isoformat()).execute()
            if not res.data:
                logger.info("No zombie matches found")
                return 0
            ids = [m["id"] for m in res.data]
            self.client.table("matches").update({
                "status": "finished",
                "status_type": "finished",
                "minute": None,
                "updated_at": now.isoformat(),
            }).in_("id", ids).execute()
            logger.info(f"✅ Removed {len(ids)} zombie matches")
            return len(ids)
        except Exception as e:
            logger.warning(f"⚠️ Cleanup failed: {e}")
            return 0

    def force_finish_old_matches(self, hours_old: int = 3) -> int:
        """Alias za gore (kompatibilnost s main.py)"""
        return self.cleanup_zombie_matches(hours_old=hours_old)

    def finish_overdue_upcoming(self, hours_old: int = 3) -> int:
        """UPCOMING/SCHEDULED koji su odavno trebali početi -> finished (bulk update)"""
        try:
            now = datetime.now(timezone.utc)
            cutoff = now - timedelta(hours=hours_old)
            statuses = ["upcoming", "scheduled", "notstarted", "not_started", "ns"]
            logger.info(f"Finishing overdue upcoming (> {hours_old}h past start)...")
            res = self.client.table("matches").update({
                "status": "finished",
                "status_type": "finished",
                "minute": None,
                "updated_at": now.isoformat(),
            }).in_("status", statuses).lt("start_time", cutoff.isoformat()).execute()
            updated = len(getattr(res, "data", []) or [])
            # neke Supabase konfiguracije ne vraćaju data na UPDATE; u tom slučaju napravi select za broj
            if updated == 0:
                sel = self.client.table("matches").select("id").in_("status", statuses).lt("start_time", cutoff.isoformat()).execute()
                updated = len(sel.data or [])
            logger.info(f"✅ Force-finished {updated} overdue upcoming matches")
            return updated
        except Exception as e:
            logger.warning(f"⚠️ finish_overdue_upcoming failed: {e}")
            return 0

# shared instance
db = DatabaseClient()
