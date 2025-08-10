# scraper/fetch_loop.py
import time
import sys
import logging
import signal
from datetime import datetime, timezone
from typing import List, Dict, Any

try:
    from tqdm import tqdm
    HAS_TQDM = True
except ImportError:
    HAS_TQDM = False

from core.config import config
from core.database import db
from core.browser import BrowserManager

from scrapers.live_scraper import LiveScraper
from scrapers.scheduled_scraper import ScheduledScraper

from processors import match_processor, competition_processor

from utils import get_logger, scraper_logger

logger = get_logger(__name__)

class ContinuousScraper:
    """Kontinuirani scraper s automatskim ponavljanjem"""
    
    def __init__(self):
        self.browser = None
        self.progress_bar = None
        self.running = True
        self.stats = {
            'total_runs': 0,
            'successful_runs': 0,
            'failed_runs': 0,
            'last_success': None,
            'last_failure': None
        }
        
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)
    
    def _signal_handler(self, signum, frame):
        """Handle Ctrl+C gracefully"""
        print("\n🛑 Stopping scraper gracefully...")
        self.running = False
        if self.progress_bar:
            self.progress_bar.close()
    
    def _update_progress(self, step: int, description: str):
        """Update progress bar if available"""
        if self.progress_bar:
            self.progress_bar.set_description(description)
            self.progress_bar.update(step)
    
    def _setup_quiet_logging(self):
        """🔧 ISPRAVKA: Potiskuje sve HTTP i verbose logove"""
        logging.getLogger("httpx").setLevel(logging.ERROR)
        
        logging.getLogger("core.database").setLevel(logging.ERROR)
        
        logging.getLogger("core.browser").setLevel(logging.ERROR)
        
        logging.getLogger("processors.match_processor").setLevel(logging.ERROR)
        logging.getLogger("processors.competition_processor").setLevel(logging.ERROR)
        logging.getLogger("processors.status_processor").setLevel(logging.ERROR)
        
        logging.getLogger("scrapers.live_scraper").setLevel(logging.ERROR)
        logging.getLogger("scrapers.scheduled_scraper").setLevel(logging.ERROR)
        logging.getLogger("scrapers.base_scraper").setLevel(logging.ERROR)
    
    def _restore_logging(self):
        """Vraća normalne log levels"""
        logging.getLogger("httpx").setLevel(logging.INFO)
        logging.getLogger("core.database").setLevel(logging.INFO)
        logging.getLogger("core.browser").setLevel(logging.INFO)
        logging.getLogger("processors.match_processor").setLevel(logging.INFO)
        logging.getLogger("processors.competition_processor").setLevel(logging.INFO)
        logging.getLogger("processors.status_processor").setLevel(logging.INFO)
        logging.getLogger("scrapers.live_scraper").setLevel(logging.INFO)
        logging.getLogger("scrapers.scheduled_scraper").setLevel(logging.INFO)
        logging.getLogger("scrapers.base_scraper").setLevel(logging.INFO)
    
    def run_single_cycle(self) -> bool:
        """Pokreni jedan ciklus scrapinga"""
        cycle_start = time.time()
        
        try:
            if HAS_TQDM:
                self.progress_bar = tqdm(
                    total=100, 
                    desc="🚀 Starting scraper", 
                    bar_format="{l_bar}{bar}| {percentage:3.0f}% [{elapsed}]",
                    colour="green"
                )
            
            if not self._setup():
                return False
            
            current_hour = datetime.now().hour
            if current_hour == 6 and self.stats['total_runs'] % 24 == 0: 
                self._update_priorities_phase()
            else:
                self._update_progress(10, "⭐ Skipping priority update")
            
            self._setup_quiet_logging()  
            self._cleanup_phase()
            
            live_matches, scheduled_matches = self._fetch_phase()
            
            if not live_matches and not scheduled_matches:
                self._restore_logging()
                logger.warning("⚠️ No data fetched")
                return False
            
            processed_matches = self._process_phase(live_matches, scheduled_matches)
            
            if not processed_matches:
                self._restore_logging()
                logger.warning("⚠️ No matches processed")
                return False
            
            success_count, failed_count = self._storage_phase(processed_matches)
            
            self._final_cleanup_phase()
            
            self._restore_logging()
            
            success_rate = (success_count / len(processed_matches)) * 100 if processed_matches else 0
            
            if success_rate < 90:
                logger.warning(f"⚠️ Low success rate ({success_rate:.1f}%)!")
                return False
            
            elapsed = time.time() - cycle_start
            if self.progress_bar:
                self.progress_bar.set_description(f"✅ Success! {success_count} matches stored in {elapsed:.1f}s")
            
            print(f"SUCCESS: {len(live_matches)} live, {len(scheduled_matches)} scheduled, {len(processed_matches)} total processed in {elapsed:.2f}s")
            return True
            
        except Exception as e:
            self._restore_logging()  # 🔧 DODANO
            if self.progress_bar:
                self.progress_bar.set_description(f"❌ Error: {str(e)[:30]}...")
            logger.error(f"❌ Scraper cycle failed: {e}")
            return False
        
        finally:
            if self.progress_bar:
                self.progress_bar.close()
                self.progress_bar = None
    
    def _setup(self) -> bool:
        """Setup scraper components"""
        try:
            self._update_progress(5, "🔧 Setting up components...")
            
            if not db.health_check():
                logger.error("❌ Database health check failed")
                return False
            
            self._update_progress(5, "🔧 Database OK, checking performance...")
            if not db.performance_check():
                logger.warning("⚠️ Database performance issues detected")
            
            self._update_progress(5, "🔧 Starting browser...")
            if not self.browser:
                self.browser = BrowserManager()
            
            if not self.browser.health_check():
                logger.warning("⚠️ Browser health issues detected")
            
            self._update_progress(5, "✅ Setup completed")
            return True
            
        except Exception as e:
            logger.error(f"❌ Setup failed: {e}")
            return False
    
    def _cleanup_phase(self) -> int:
        """Phase 1: Cleanup old and zombie matches"""
        self._update_progress(5, "🧹 Cleaning old matches...")
        
        old_count = db.force_finish_old_matches(hours_old=2)
        zombie_count = db.cleanup_zombie_matches(hours_old=config.ZOMBIE_HOUR_LIMIT)
        
        total_cleaned = old_count + zombie_count
        self._update_progress(5, f"🧹 Cleaned {total_cleaned} matches")
        
        if total_cleaned > 10:  
            self._restore_logging()
            logger.info(f"✅ Major cleanup: {total_cleaned} matches cleaned")
            self._setup_quiet_logging()
        
        return total_cleaned
    
    def _update_priorities_phase(self) -> int:
        """Phase 0: Update competition priorities"""
        self._update_progress(5, "⭐ Updating priorities...")
        
        updated_count = competition_processor.update_all_competition_priorities()
        self._update_progress(5, f"⭐ Updated {updated_count} priorities")
        
        if updated_count > 0:
            self._restore_logging()
            logger.info(f"✅ Priority update: {updated_count} competitions")
            self._setup_quiet_logging()
        
        return updated_count
    
    def _fetch_phase(self) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        """Phase 2: Fetch fresh data"""
        self._update_progress(5, "📡 Fetching live matches...")
        
        if not self.browser.health_check():
            self._restore_logging()
            logger.warning("⚠️ Browser health issues, continuing anyway...")
            self._setup_quiet_logging()
        
        try:
            live_scraper = LiveScraper(self.browser)
            live_matches = live_scraper.scrape()
            
            self._update_progress(10, f"📡 Got {len(live_matches)} live, fetching scheduled...")
            
            today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            scheduled_scraper = ScheduledScraper(self.browser, today)
            scheduled_matches = scheduled_scraper.scrape()
            
            self._update_progress(10, f"📡 Fetched {len(live_matches)} live + {len(scheduled_matches)} scheduled")
            
        except Exception as e:
            self._restore_logging()
            logger.error(f"❌ Fetch failed: {e}")
            self._setup_quiet_logging()
            raise
        
        return live_matches, scheduled_matches
    
    def _process_phase(self, live_matches: List[Dict[str, Any]], 
                      scheduled_matches: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Phase 3: Process and prepare data"""
        self._update_progress(5, "⚙️ Processing data...")
        
        all_matches = live_matches + scheduled_matches
        
        if not all_matches:
            return []
        
        self._update_progress(10, f"⚙️ Processing {len(all_matches)} matches...")
        
        try:
            live_only = [m for m in all_matches if m.get('status') in ['live', 'ht']]
            if live_only:
                match_processor.debug_minute_calculations(live_only)
            
            db_ready_matches = match_processor.prepare_for_database(all_matches)
            
            self._update_progress(5, f"⚙️ Processed {len(db_ready_matches)} matches")
            
        except Exception as e:
            self._restore_logging()
            logger.error(f"❌ Processing failed: {e}")
            self._setup_quiet_logging()
            raise
        
        return db_ready_matches
    
    def _storage_phase(self, matches: List[Dict[str, Any]]) -> tuple[int, int]:
        """Phase 4: Store matches in database"""
        self._update_progress(5, f"💾 Storing {len(matches)} matches...")
        
        if not matches:
            return 0, 0
        
        try:
            success_count, failed_count = db.batch_upsert_matches(matches)
            self._update_progress(15, f"💾 Stored {success_count}/{len(matches)} matches")
            
            if failed_count > 0:
                self._restore_logging()
                logger.error(f"❌ Storage issues: {failed_count} failed")
                self._setup_quiet_logging()
            
        except Exception as e:
            self._restore_logging()
            logger.error(f"❌ Storage failed: {e}")
            self._setup_quiet_logging()
            raise
        
        return success_count, failed_count
    
    def _final_cleanup_phase(self) -> int:
        """Phase 5: Final cleanup"""
        self._update_progress(5, "🧹 Final cleanup...")
        
        final_zombies = db.cleanup_zombie_matches(hours_old=config.ZOMBIE_HOUR_LIMIT)
        
        if self.browser:
            self.browser.cleanup_resources()
        
        self._update_progress(5, "✅ Cleanup completed")
        
        if final_zombies > 5:  
            self._restore_logging()
            logger.info(f"✅ Final cleanup: {final_zombies} zombies")
            self._setup_quiet_logging()
        
        return final_zombies
    
    def run_continuous(self, interval_seconds: int = 30):
        """Pokreni kontinuirani scraping loop"""
        logger.info("🚀 Starting continuous scraper...")
        print("🔄 Continuous scraper started. Press Ctrl+C to stop.")
        
        try:
            while self.running:
                self.stats['total_runs'] += 1
                
                logger.info(f"🔄 Starting scraper cycle #{self.stats['total_runs']}")
                success = self.run_single_cycle()
                
                if success:
                    self.stats['successful_runs'] += 1
                    self.stats['last_success'] = datetime.now()
                else:
                    self.stats['failed_runs'] += 1
                    self.stats['last_failure'] = datetime.now()
                
                if not self.running:
                    break
                
                logger.info(f"⏰ Waiting {interval_seconds}s for next cycle...")
                for i in range(interval_seconds):
                    if not self.running:
                        break
                    time.sleep(1)
                
        except KeyboardInterrupt:
            print("\n🛑 Scraper stopped by user")
        finally:
            self._cleanup()
    
    def _cleanup(self):
        """Cleanup resources"""
        if self.browser:
            self.browser.close()
        
        print("\n" + "="*50)
        print("📊 SCRAPER STATISTICS")
        print("="*50)
        print(f"Total Runs: {self.stats['total_runs']}")
        print(f"Successful: {self.stats['successful_runs']}")
        print(f"Failed: {self.stats['failed_runs']}")
        if self.stats['total_runs'] > 0:
            success_rate = (self.stats['successful_runs'] / self.stats['total_runs']) * 100
            print(f"Success Rate: {success_rate:.1f}%")
        print("="*50)

def main():
    """Main entry point"""
    try:
        scraper = ContinuousScraper()
        
        # Interval između ciklusa
        interval = 30
        
        scraper.run_continuous(interval_seconds=interval)
        
    except Exception as e:
        print(f"ERROR: Critical scraper failure: {e}")
        logger.error(f"🚨 Critical failure: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()