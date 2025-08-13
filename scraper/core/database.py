# scraper/core/database.py
from __future__ import annotations

import time
import uuid
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timezone, timedelta

from supabase import create_client, Client
from .config import config
from utils.logger import get_logger

logger = get_logger(__name__)


class DatabaseClient:
    """
    Supabase client s batch upsert-om, retry logikom i helperima
    - Upsert mečeva: pokušaj (source, source_event_id) ako postoji unique index,
      fallback na 'id' ako composite conflict nije dostupan ili je source_event_id NULL.
    - Upsert timova/igrača: preko sofascore_id (unique/partial index).
    """

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

    # ---------- Health / perf ----------

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

    # ---------- Upserts ----------

    def _resolve_match_on_conflict(self, batch: List[Dict[str, Any]]) -> str:
        """
        Ako batch sadrži 'source' i 'source_event_id' (ne-NULL) koristimo composite conflict,
        inače padamo na 'id'.
        """
        has_source_ids = any(m.get("source") and m.get("source_event_id") for m in batch)
        # Ako vam je kreiran partial unique index:
        #   CREATE UNIQUE INDEX uq_matches_source_event ON public.matches(source, source_event_id)
        #   WHERE source_event_id IS NOT NULL;
        # supabase-python podržava on_conflict="col1,col2"
        return "source,source_event_id" if has_source_ids else "id"

# scraper/core/database.py - ZAMIJENI POSTOJEĆU batch_upsert_matches FUNKCIJU

    def batch_upsert_matches(self, matches: List[Dict[str, Any]], batch_size: int = 50) -> tuple[int, int]:
        """Batch upsert matches using primary key 'id' or unique constraint"""
        if not matches:
            return 0, 0
        
        total_success = 0
        total_failed = 0
        failed_matches = []
        total_batches = (len(matches) + batch_size - 1) // batch_size
        
        logger.info(f"Starting batch upsert of {len(matches)} matches (batch size: {batch_size})")
        
        for i in range(0, len(matches), batch_size):
            batch = matches[i:i + batch_size]
            batch_num = i // batch_size + 1
            
            logger.info(f"Processing batch {batch_num}/{total_batches} ({len(batch)} matches)")
            
            for attempt in range(3):  # Retry attempts
                try:
                    # ✅ ISPRAVKA: Try different upsert strategies
                    
                    # Pokušaj s primarnim ključem ako postoji 'id' polje
                    if all(match.get('id') for match in batch):
                        result = self.client.table("matches").upsert(
                            batch,
                            on_conflict="id"  # ✅ Use primary key
                        ).execute()
                    else:
                        # Fallback: koristi unique constraint na source + source_event_id
                        result = self.client.table("matches").upsert(
                            batch,
                            on_conflict="source,source_event_id"  # ✅ Fallback constraint
                        ).execute()
                    
                    success_count = len(batch)
                    total_success += success_count
                    logger.info(f"✅ Batch {batch_num}: {success_count}/{len(batch)} matches stored")
                    break
                    
                except Exception as e:
                    logger.error(f"❌ Batch {batch_num} attempt {attempt + 1} failed: {str(e)}")
                    
                    if attempt < 2:  # Not last attempt
                        wait_time = (attempt + 1) * 2
                        logger.info(f"Waiting {wait_time}s before retry...")
                        time.sleep(wait_time)
                    else:
                        # Individual inserts on final failure
                        logger.warning(f"Batch {batch_num} failed, trying individual inserts...")
                        
                        for match_data in batch:
                            try:
                                # Individual upsert attempt
                                if match_data.get('id'):
                                    self.client.table("matches").upsert(
                                        match_data, 
                                        on_conflict="id"  # ✅ Primary key
                                    ).execute()
                                else:
                                    # Fallback za matches bez id-a - koristi insert
                                    self.client.table("matches").insert(match_data).execute()
                                
                                total_success += 1
                            except Exception as individual_e:
                                total_failed += 1
                                failed_matches.append({
                                    'id': match_data.get('id', 'unknown'),
                                    'match': f"{match_data.get('home_team', 'Unknown')} vs {match_data.get('away_team', 'Unknown')}",
                                    'error': str(individual_e)
                                })
                                logger.error(f"Individual insert failed: {match_data.get('home_team')} vs {match_data.get('away_team')}")
            
            # Short delay between batches
            if i + batch_size < len(matches):
                time.sleep(0.5)
        
        # Statistics
        success_rate = (total_success / len(matches)) * 100 if matches else 0
        
        logger.info(f"Batch upsert completed:")
        logger.info(f"  Total matches: {len(matches)}")
        logger.info(f"  Successful: {total_success}")
        logger.info(f"  Failed: {total_failed}")
        logger.info(f"  Success rate: {success_rate:.1f}%")
        
        if failed_matches:
            logger.warning(f"Failed matches ({len(failed_matches)}):")
            for fail in failed_matches[:5]:  # Show first 5 failures
                logger.warning(f"  - {fail['match']}: {fail['error'][:50]}...")
        
        return total_success, total_failed

    def upsert_teams(self, teams: List[Dict[str, Any]]) -> Tuple[int, int]:
        if not teams:
            return 0, 0
        ok = 0
        fail = 0
        # koristimo partial unique index na sofascore_id (ako postoji); inače ponavlja insert po imenu
        for attempt in range(getattr(config, "RETRY_ATTEMPTS", 3)):
            try:
                self.client.table("teams").upsert(teams, on_conflict="sofascore_id").execute()
                ok = len(teams)
                return ok, fail
            except Exception as e:
                logger.warning(f"Teams upsert attempt {attempt+1} failed: {e}")
                time.sleep((attempt + 1) * 2)
        # zadnji fallback – pojedinačno
        for t in teams:
            try:
                self.client.table("teams").upsert(t, on_conflict="sofascore_id").execute()
                ok += 1
            except Exception:
                # fallback po imenu (ako sofascore_id nema)
                try:
                    if t.get("name"):
                        self.client.table("teams").upsert({"name": t["name"], **{k: v for k, v in t.items() if k != "sofascore_id"}}, on_conflict="name").execute()
                        ok += 1
                    else:
                        fail += 1
                except Exception as e2:
                    logger.error(f"Team upsert failed: {t.get('name')} | {e2}")
                    fail += 1
        return ok, fail

    def upsert_players(self, players: List[Dict[str, Any]]) -> Tuple[int, int]:
        if not players:
            return 0, 0
        ok = 0
        fail = 0
        try:
            self.client.table("players").upsert(players, on_conflict="sofascore_id").execute()
            ok = len(players)
        except Exception as e:
            logger.warning(f"Players bulk upsert failed: {e}")
            # fallback pojedinačno
            for p in players:
                try:
                    self.client.table("players").upsert(p, on_conflict="sofascore_id").execute()
                    ok += 1
                except Exception as e2:
                    logger.error(f"Player upsert failed: {p.get('full_name')} | {e2}")
                    fail += 1
        return ok, fail

    # ---------- Competitions helper ----------

    def get_or_create_competition(self, tournament: Dict[str, Any]) -> Optional[str]:
        name = str(tournament.get("name") or "Unknown")
        if not name:
            return None

        # cache key – sofascore id ako postoji, inače ime
        key = tournament.get("id") or name
        cached = self.competition_cache.get(key)
        if cached:
            return cached

        country = ""
        logo_url = None
        cat = tournament.get("category") or {}
        if isinstance(cat, dict):
            country = str(cat.get("name") or "")
            logo_url = cat.get("flag")

        calc_prio = config.get_league_priority(name)
        ss_prio = int(tournament.get("priority") or 0)
        final_prio = max(calc_prio, ss_prio)

        try:
            existing = self.client.table("competitions").select("id,priority").eq("name", name).limit(1).execute()
            if existing.data:
                comp_id = existing.data[0]["id"]
                old_prio = existing.data[0].get("priority", 0)
                if final_prio > (old_prio or 0):
                    self.client.table("competitions").update({"priority": final_prio}).eq("id", comp_id).execute()
                    logger.info(f"Updated competition priority {name}: {old_prio} -> {final_prio}")
                self.competition_cache[key] = comp_id
                return comp_id
        except Exception as e:
            logger.warning(f"Competition select failed: {e}")

        try:
            new_id = str(uuid.uuid4())
            row = {"id": new_id, "name": name, "country": country, "logo_url": logo_url, "priority": final_prio}
            self.client.table("competitions").insert(row).execute()
            self.competition_cache[key] = new_id
            logger.info(f"Created competition: {name} (priority {final_prio})")
            return new_id
        except Exception as e:
            logger.error(f"Create competition failed ({name}): {e}")
            return None

    # ---------- Cleanup ----------

    def cleanup_zombie_matches(self, hours_old: int = 3) -> int:
        try:
            now = datetime.now(timezone.utc)
            cutoff = now - timedelta(hours=hours_old)
            logger.info(f"Cleaning zombie matches older than {hours_old}h...")
            res = self.client.table("matches").select("id,home_team,away_team,competition,home_score,away_score,start_time") \
                .in_("status", ["live", "ht"]) \
                .lt("start_time", cutoff.isoformat()) \
                .execute()
            if not res.data:
                logger.info("No zombie matches found")
                return 0
            count = 0
            for m in res.data:
                self.client.table("matches").update({
                    "status": "finished",
                    "status_type": "finished",
                    "minute": None
                }).eq("id", m["id"]).execute()
                count += 1
            logger.info(f"✅ Removed {count} zombie matches")
            return count
        except Exception as e:
            logger.warning(f"⚠️ Cleanup failed: {e}")
            return 0


# shared instance
db = DatabaseClient()
