# scraper/core/database.py 
import time
import uuid
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone, timedelta
from supabase import create_client, Client
from .config import config
try:
    from utils.logger import get_logger
except ImportError:
    # Fallback logger ako utils nisu dostupni
    import logging
    logging.basicConfig(level=logging.INFO, format='[%(asctime)s] %(levelname)s [%(name)s] %(message)s')
    def get_logger(name): return logging.getLogger(name)

logger = get_logger(__name__)

class DatabaseClient:
    """Poboljšani Supabase client s batch operations i retry logikom"""
    
    def __init__(self):
        self.client = self._create_client()
        self.competition_cache = {}
        
    def _create_client(self) -> Client:
        """Kreira Supabase client s optimiziranim postavkama"""
        logger.info("Initializing database client...")
        
        try:
            
            
            client = create_client(
                config.SUPABASE_URL, 
                config.SUPABASE_SERVICE_KEY
            )
            
            logger.info("✅ Database client initialized")
            return client
            
        except Exception as e:
            logger.error(f"❌ Failed to initialize database client: {e}")
            raise
    
    def health_check(self) -> bool:
        """Provjeri konekciju s bazom"""
        try:
            logger.info("Checking database connection...")
            
            result = self.client.table("matches").select("id").limit(1).execute()
            
            if result.data is not None:
                logger.info("✅ Database connection OK")
                return True
            else:
                logger.error("❌ Database connection failed - no data returned")
                return False
                
        except Exception as e:
            logger.error(f"❌ Database connection failed: {e}")
            return False
    
    def performance_check(self) -> bool:
        """Provjeri performanse baze"""
        try:
            start_time = time.time()
            
            result = self.client.table("matches").select("count", count="exact").limit(1).execute()
            
            query_time = time.time() - start_time
            total_matches = result.count if hasattr(result, 'count') else 0
            
            logger.info(f"Database query time: {query_time:.2f}s")
            logger.info(f"Total matches in DB: {total_matches}")
            
            if query_time > 5:
                logger.warning(f"Slow database response ({query_time:.2f}s)")
            
            return query_time < 10
            
        except Exception as e:
            logger.error(f"Performance check failed: {e}")
            return False
    
    def batch_upsert_matches(self, matches: List[Dict[str, Any]], batch_size: int = None) -> tuple[int, int]:
        """Batch upsert utakmica s poboljšanim error handling"""
        if not matches:
            logger.warning("No matches to store")
            return 0, 0
        
        batch_size = batch_size or config.BATCH_SIZE
        total_success = 0
        total_failed = 0
        failed_matches = []
        
        logger.info(f"Starting batch upsert of {len(matches)} matches (batch size: {batch_size})")
        
        # Podijeli u batch-ove
        for i in range(0, len(matches), batch_size):
            batch = matches[i:i + batch_size]
            batch_num = i // batch_size + 1
            total_batches = (len(matches) + batch_size - 1) // batch_size
            
            logger.info(f"Processing batch {batch_num}/{total_batches} ({len(batch)} matches)")
            
            # Retry logika za batch
            for attempt in range(config.RETRY_ATTEMPTS):
                try:
                    result = self.client.table("matches").upsert(
                        batch,
                        on_conflict="id" 
                    ).execute()
                    
                    # Provjeri success count
                    success_count = len(batch)  
                    total_success += success_count
                    
                    logger.info(f"✅ Batch {batch_num}: {success_count}/{len(batch)} matches stored")
                    break
                    
                except Exception as e:
                    logger.error(f"❌ Batch {batch_num} attempt {attempt + 1} failed: {str(e)}")
                    
                    if attempt < config.RETRY_ATTEMPTS - 1:
                        wait_time = (attempt + 1) * 2  
                        logger.info(f"Waiting {wait_time}s before retry...")
                        time.sleep(wait_time)
                    else:
                        logger.warning(f"Batch {batch_num} failed, trying individual inserts...")
                        
                        for match_data in batch:
                            try:
                                self.client.table("matches").upsert(match_data, on_conflict="id").execute()
                                total_success += 1
                            except Exception as individual_e:
                                total_failed += 1
                                failed_matches.append({
                                    'id': match_data.get('id', 'unknown'),
                                    'match': f"{match_data.get('home_team', 'Unknown')} vs {match_data.get('away_team', 'Unknown')}",
                                    'error': str(individual_e)
                                })
                                logger.error(f"Individual insert failed: {match_data.get('home_team')} vs {match_data.get('away_team')}")
            
            if i + batch_size < len(matches):
                time.sleep(0.5)
        
        success_rate = (total_success / len(matches)) * 100 if matches else 0
        
        logger.info(f"Batch upsert completed:")
        logger.info(f"  📊 Total processed: {len(matches)}")
        logger.info(f"  ✅ Successfully stored: {total_success}")
        logger.info(f"  ❌ Failed: {total_failed}")
        logger.info(f"  📈 Success rate: {success_rate:.1f}%")
        
        if failed_matches:
            logger.warning(f"Failed matches ({len(failed_matches)}):")
            for fail in failed_matches[:5]:  # Show first 5
                logger.warning(f"  - {fail['match']}: {fail['error'][:50]}...")
        
        if success_rate < 90:
            logger.warning(f"Low success rate ({success_rate:.1f}%)! Check Supabase connection/limits")
        
        return total_success, total_failed
    
    def get_or_create_competition(self, tournament_data: Dict[str, Any]) -> Optional[str]:
        """Dohvati ili stvori natjecanje s priority"""
        tournament_name = tournament_data.get("name", "Unknown")
        tournament_id = tournament_data.get("id")
        
        if not tournament_id:
            return None
        
        # Check cache first
        if tournament_id in self.competition_cache:
            return self.competition_cache[tournament_id]
        
        country = tournament_data.get("category", {}).get("name", "Unknown")
        logo_url = tournament_data.get("category", {}).get("flag", None)
        
        # Calculate priority
        calculated_priority = config.get_league_priority(tournament_name)
        sofascore_priority = tournament_data.get("priority", 0)
        final_priority = max(calculated_priority, sofascore_priority)
        
        # Check database
        try:
            existing = self.client.table("competitions").select("id", "priority").eq("name", tournament_name).execute()
            
            if existing.data:
                comp_id = existing.data[0]["id"]
                existing_priority = existing.data[0].get("priority", 0)
                
                # Update priority if ours is better
                if final_priority > existing_priority:
                    self.client.table("competitions").update({
                        "priority": final_priority
                    }).eq("id", comp_id).execute()
                    logger.info(f"Updated {tournament_name} priority: {existing_priority} -> {final_priority}")
                
                self.competition_cache[tournament_id] = comp_id
                return comp_id
                
        except Exception as e:
            logger.warning(f"Error checking competition: {e}")
        
        # Create new competition
        try:
            new_id = str(uuid.uuid4())
            comp_data = {
                "id": new_id,
                "name": tournament_name,
                "country": country,
                "logo_url": logo_url,
                "priority": final_priority
            }
            
            self.client.table("competitions").insert(comp_data).execute()
            self.competition_cache[tournament_id] = new_id
            
            logger.info(f"Created competition: {tournament_name} (priority: {final_priority})")
            return new_id
            
        except Exception as e:
            logger.error(f"Failed to create competition {tournament_name}: {e}")
            return None
    
    def cleanup_zombie_matches(self, hours_old: int = 3) -> int:
        """Očisti zombie utakmice starije od X sati"""
        try:
            now = datetime.now(timezone.utc)
            cutoff_time = now - timedelta(hours=hours_old)
            
            logger.info(f"Cleaning zombie matches older than {hours_old}h...")
            
            # Find zombie matches
            zombie_matches = self.client.table("matches").select(
                "id", "start_time", "status", "home_team", "away_team", "competition"
            ).in_(
                "status", ["live", "ht"]
            ).lt("start_time", cutoff_time.isoformat()).execute()
            
            if not zombie_matches.data:
                logger.info("No zombie matches found")
                return 0
            
            zombie_count = 0
            zombie_leagues = {}
            
            for match in zombie_matches.data:
                league = match.get('competition', 'Unknown')
                zombie_leagues[league] = zombie_leagues.get(league, 0) + 1
                
                logger.debug(f"Zombie: {match['home_team']} vs {match['away_team']} ({league})")
                
                update_data = {
                    "status": "finished",
                    "status_type": "finished",
                    "minute": None,
                    "updated_at": now.isoformat()
                }
                
                self.client.table("matches").update(update_data).eq("id", match["id"]).execute()
                zombie_count += 1
            
            logger.info(f"Cleaned {zombie_count} zombie matches across {len(zombie_leagues)} leagues")
            
            # Show league breakdown
            for league, count in sorted(zombie_leagues.items(), key=lambda x: x[1], reverse=True):
                logger.info(f"  - {league}: {count} zombies")
            
            return zombie_count
            
        except Exception as e:
            logger.error(f"Zombie cleanup failed: {e}")
            return 0
    
    def force_finish_old_matches(self, hours_old: int = 2) -> int:
        """Forsiraj završetak svih live utakmica starijih od X sati"""
        try:
            now = datetime.now(timezone.utc)
            cutoff_time = now - timedelta(hours=hours_old)
            
            logger.info(f"Force finishing matches older than {hours_old}h...")
            
            old_matches = self.client.table("matches").select("id").in_(
                "status", ["live", "ht"]
            ).lt("start_time", cutoff_time.isoformat()).execute()
            
            if not old_matches.data:
                logger.info("No old live matches found")
                return 0
            
            count = 0
            for match in old_matches.data:
                try:
                    self.client.table("matches").update({
                        "status": "finished",
                        "status_type": "finished",
                        "minute": None,
                        "updated_at": now.isoformat()
                    }).eq("id", match["id"]).execute()
                    count += 1
                except Exception as e:
                    logger.warning(f"Failed to update match {match['id']}: {e}")
            
            logger.info(f"Force finished {count} old live matches")
            return count
            
        except Exception as e:
            logger.error(f"Force cleanup failed: {e}")
            return 0
    
    def get_live_count(self) -> int:
        """Dohvati trenutni broj live utakmica"""
        try:
            result = self.client.table("matches").select("count", count="exact").in_(
                "status", ["live", "ht", "inprogress", "halftime"]
            ).execute()
            
            return result.count if hasattr(result, 'count') else 0
            
        except Exception as e:
            logger.error(f"Failed to get live count: {e}")
            return 0

db = DatabaseClient()