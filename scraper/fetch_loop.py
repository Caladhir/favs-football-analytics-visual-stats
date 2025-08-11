# scraper/fetch_loop.py - BRŽI REFRESH ZA LIVE UTAKMICE
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
        self.running = True
        self.stats = {
            'total_runs': 0,
            'successful_runs': 0,
            'failed_runs': 0,
            'last_success': None,
            'last_failure': None,
            'total_matches_processed': 0,
            'total_live_matches': 0,
            'total_scheduled_matches': 0
        }
        
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)
    
    def _signal_handler(self, signum, frame):
        """Handle Ctrl+C gracefully"""
        print(f"\n🛑 Received signal {signum}, stopping scraper gracefully...")
        self.running = False
    
    def _setup_quiet_logging(self):
        """Potiskuje sve HTTP i verbose logove"""
        loggers_to_quiet = [
            "httpx", "core.database", "core.browser",
            "processors.match_processor", "processors.competition_processor", 
            "processors.status_processor", "scrapers.live_scraper", 
            "scrapers.scheduled_scraper", "scrapers.base_scraper"
        ]
        
        for logger_name in loggers_to_quiet:
            logging.getLogger(logger_name).setLevel(logging.ERROR)
    
    def _restore_logging(self):
        """Vraća normalne log levels"""
        loggers_to_restore = [
            "httpx", "core.database", "core.browser",
            "processors.match_processor", "processors.competition_processor", 
            "processors.status_processor", "scrapers.live_scraper", 
            "scrapers.scheduled_scraper", "scrapers.base_scraper"
        ]
        
        for logger_name in loggers_to_restore:
            logging.getLogger(logger_name).setLevel(logging.INFO)
    
    def _get_adaptive_interval(self, live_matches_count: int, consecutive_failures: int) -> int:
        """🔧 NOVO: Adaptivni interval ovisno o broju live utakmica"""
        base_interval = 30
        
        # Brži refresh kad ima više live utakmica
        if live_matches_count > 20:
            base_interval = 15  # 15 sekundi za puno live utakmica
        elif live_matches_count > 10:
            base_interval = 20  # 20 sekundi za umjereno live utakmica
        elif live_matches_count > 0:
            base_interval = 25  # 25 sekundi kad ima neke live utakmice
        # Inače standardnih 30 sekundi
        
        # Dodaj penalty za consecutive failures
        penalty = consecutive_failures * 5
        
        return min(base_interval + penalty, 60)  # Max 60 sekundi
    
    def run_single_cycle(self) -> bool:
        """Pokreni jedan ciklus scrapinga"""
        cycle_start = time.time()
        
        try:
            # Setup
            if not self._setup():
                return False
            
            # Priority update (samo ujutro)
            current_hour = datetime.now().hour
            if current_hour == 6 and self.stats['total_runs'] % 24 == 0:
                self._update_priorities_phase()
            
            # Gentle cleanup
            self._setup_quiet_logging()
            cleaned_count = self._gentle_cleanup_phase()
            
            # Fetch data
            live_matches, scheduled_matches = self._fetch_phase()
            
            if not live_matches and not scheduled_matches:
                self._restore_logging()
                logger.warning("⚠️ No data fetched")
                return False
            
            # Process data
            processed_matches = self._process_phase(live_matches, scheduled_matches)
            
            if not processed_matches:
                self._restore_logging()
                logger.warning("⚠️ No matches processed")
                return False
            
            # Store data s progress bar
            success_count, failed_count = self._batch_store_matches(processed_matches)
            
            # Minimal cleanup
            self._minimal_cleanup_phase()
            
            self._restore_logging()
            
            # Ažuriraj statistike
            self.stats['total_matches_processed'] += len(processed_matches)
            self.stats['total_live_matches'] += len(live_matches)
            self.stats['total_scheduled_matches'] += len(scheduled_matches)
            
            elapsed = time.time() - cycle_start
            success_rate = (success_count / len(processed_matches)) * 100 if processed_matches else 0
            
            if success_rate < 80:
                logger.warning(f"⚠️ Low success rate ({success_rate:.1f}%)!")
                return False
            
            # 🔧 POBOLJŠANI output s live info
            live_indicator = f"🔴 {len(live_matches)} live" if live_matches else "⚫ no live"
            print(f"✅ Cycle #{self.stats['total_runs'] + 1}: {live_indicator}, {len(scheduled_matches)} scheduled → {success_count} stored ({elapsed:.1f}s)")
            return True
            
        except Exception as e:
            self._restore_logging()
            logger.error(f"❌ Scraper cycle failed: {e}")
            return False
    
    def _batch_store_matches(self, matches: List[Dict[str, Any]]) -> tuple[int, int]:
        """Batch storage s progress bar kao u init_match_dataset.py"""
        if not matches:
            return 0, 0
        
        BATCH_SIZE = 50  # 🔧 Manji batch za brže operacije
        success_count = 0
        error_count = 0
        
        if not HAS_TQDM:
            # Fallback bez tqdm
            total_batches = (len(matches) + BATCH_SIZE - 1) // BATCH_SIZE
            for i in range(0, len(matches), BATCH_SIZE):
                batch = matches[i:i + BATCH_SIZE]
                batch_num = i // BATCH_SIZE + 1
                
                for attempt in range(3):
                    try:
                        db.batch_upsert_matches(batch)
                        success_count += len(batch)
                        print(f"💾 Batch {batch_num}/{total_batches}: {len(batch)} matches")
                        break
                    except Exception as e:
                        if attempt == 2:  # Last attempt
                            error_count += len(batch)
                            print(f"❌ Batch {batch_num} failed: {e}")
                        else:
                            time.sleep(0.5)
                
                time.sleep(0.02)  # Kraća pauza
            
            return success_count, error_count
        
        # S tqdm - ISTI FORMAT KAO U INIT_MATCH_DATASET
        for i in tqdm(range(0, len(matches), BATCH_SIZE), desc="Upserting batches", unit="batch"):
            batch = matches[i:i + BATCH_SIZE]
            
            for attempt in range(3):
                try:
                    db.batch_upsert_matches(batch)
                    success_count += len(batch)
                    break
                except Exception as e:
                    if attempt == 2:  # Last attempt
                        error_count += len(batch)
                        print(f"[ERROR] Batch upsert permanently failed: {e}")
                    else:
                        time.sleep(0.5)
            
            # Kraća pauza između batch-ova za brže operacije
            time.sleep(0.02)
        
        if success_count > 0:
            print(f"[OK] Uspješno spremljeno: {success_count}")
        if error_count > 0:
            print(f"[ERROR] Grešaka prilikom spremanja: {error_count}")
        
        return success_count, error_count
    
    def _setup(self) -> bool:
        """Setup scraper components"""
        try:
            try:
                if not db.health_check():
                    logger.error("❌ Database health check failed")
                    return False
            except Exception as e:
                logger.warning(f"⚠️ Database health check failed: {e}")
            
            if not self.browser:
                self.browser = BrowserManager()
            
            return True
            
        except Exception as e:
            logger.error(f"❌ Setup failed: {e}")
            return False
    
    def _gentle_cleanup_phase(self) -> int:
        """Blaži cleanup koji ne blokira"""
        try:
            # 🔧 Samo kritični cleanup - možda svaki 10. ciklus
            if self.stats['total_runs'] % 10 == 0:
                zombie_count = db.cleanup_zombie_matches(hours_old=24)
                
                if zombie_count > 5:
                    self._restore_logging()
                    logger.info(f"✅ Gentle cleanup: {zombie_count} zombies removed")
                    self._setup_quiet_logging()
                
                return zombie_count
            
            return 0
        except Exception as e:
            logger.warning(f"⚠️ Cleanup failed: {e}")
            return 0
    
    def _minimal_cleanup_phase(self) -> int:
        """Minimalni cleanup"""
        try:
            if self.browser:
                self.browser.cleanup_resources()
            return 0
        except Exception as e:
            logger.warning(f"⚠️ Minimal cleanup failed: {e}")
            return 0
    
    def _update_priorities_phase(self) -> int:
        """Update competition priorities"""
        try:
            updated_count = competition_processor.update_all_competition_priorities()
            
            if updated_count > 0:
                self._restore_logging()
                logger.info(f"✅ Priority update: {updated_count} competitions")
                self._setup_quiet_logging()
            
            return updated_count
        except Exception as e:
            logger.warning(f"⚠️ Priority update failed: {e}")
            return 0
    
    def _fetch_phase(self) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        """Fetch fresh data"""
        try:
            live_scraper = LiveScraper(self.browser)
            live_matches = live_scraper.scrape()
            
            today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            scheduled_scraper = ScheduledScraper(self.browser, today)
            scheduled_matches = scheduled_scraper.scrape()
            
            return live_matches, scheduled_matches
            
        except Exception as e:
            self._restore_logging()
            logger.error(f"❌ Fetch failed: {e}")
            self._setup_quiet_logging()
            return [], []
    
    def _process_phase(self, live_matches: List[Dict[str, Any]], 
                      scheduled_matches: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Process and prepare data"""
        all_matches = live_matches + scheduled_matches
        
        if not all_matches:
            return []
        
        try:
            db_ready_matches = match_processor.prepare_for_database(all_matches)
            return db_ready_matches
            
        except Exception as e:
            self._restore_logging()
            logger.error(f"❌ Processing failed: {e}")
            self._setup_quiet_logging()
            return []
    
    def run_continuous(self, base_interval_seconds: int = 30):
        """🔧 POBOLJŠANI: Kontinuirani scraping loop s adaptivnim intervalom"""
        logger.info("🚀 Starting continuous scraper...")
        print("🔄 Continuous scraper started. Press Ctrl+C to stop.")
        print(f"⏰ Base interval: {base_interval_seconds}s (adaptive based on live matches)")
        print("🔴 More live matches = faster refresh")
        print("=" * 70)
        
        consecutive_failures = 0
        max_consecutive_failures = 5
        
        try:
            while self.running:
                self.stats['total_runs'] += 1
                
                # Auto-pause on consecutive failures
                if consecutive_failures >= max_consecutive_failures:
                    print(f"⚠️ Too many failures ({consecutive_failures}), pausing 2 minutes...")
                    time.sleep(120)
                    consecutive_failures = 0
                
                print(f"🔄 Starting cycle #{self.stats['total_runs']}...")
                
                success = self.run_single_cycle()
                
                if success:
                    self.stats['successful_runs'] += 1
                    self.stats['last_success'] = datetime.now()
                    consecutive_failures = 0
                else:
                    self.stats['failed_runs'] += 1
                    self.stats['last_failure'] = datetime.now()
                    consecutive_failures += 1
                
                if not self.running:
                    break
                
                # 🔧 NOVO: Adaptivni interval
                actual_interval = self._get_adaptive_interval(
                    self.stats['total_live_matches'], 
                    consecutive_failures
                )
                
                print(f"⏰ Next refresh in {actual_interval}s...")
                
                # Countdown s progress bar
                if HAS_TQDM:
                    for i in tqdm(range(actual_interval), desc="Next cycle in", unit="s"):
                        if not self.running:
                            break
                        time.sleep(1)
                else:
                    for i in range(actual_interval):
                        if not self.running:
                            break
                        time.sleep(1)
                
        except KeyboardInterrupt:
            print("\n🛑 Scraper stopped by user")
        except Exception as e:
            print(f"\n❌ CRITICAL ERROR: {e}")
            logger.error(f"🚨 Critical failure: {e}")
        finally:
            self._cleanup()
    
    def _cleanup(self):
        """Cleanup resources"""
        print("\n🧹 Cleaning up resources...")
        
        try:
            if self.browser:
                self.browser.close()
        except Exception as e:
            logger.warning(f"⚠️ Browser cleanup failed: {e}")
        
        print("\n" + "=" * 70)
        print("📊 FINAL SCRAPER STATISTICS")
        print("=" * 70)
        print(f"Total Cycles: {self.stats['total_runs']}")
        print(f"Successful: {self.stats['successful_runs']}")
        print(f"Failed: {self.stats['failed_runs']}")
        
        if self.stats['total_runs'] > 0:
            success_rate = (self.stats['successful_runs'] / self.stats['total_runs']) * 100
            print(f"Success Rate: {success_rate:.1f}%")
        
        print(f"Total Matches Processed: {self.stats['total_matches_processed']:,}")
        print(f"Live Matches: {self.stats['total_live_matches']:,}")
        print(f"Scheduled Matches: {self.stats['total_scheduled_matches']:,}")
        
        if self.stats['last_success']:
            print(f"Last Success: {self.stats['last_success'].strftime('%H:%M:%S')}")
        
        if self.stats['last_failure']:
            print(f"Last Failure: {self.stats['last_failure'].strftime('%H:%M:%S')}")
        
        print("=" * 70)
        print("👋 Scraper stopped gracefully!")


def main():
    """Main entry point"""
    try:
        scraper = ContinuousScraper()
        interval = 30  # Base interval, will be adaptive
        scraper.run_continuous(base_interval_seconds=interval)
        
    except Exception as e:
        print(f"❌ CRITICAL ERROR: {e}")
        logger.error(f"🚨 Critical failure: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()