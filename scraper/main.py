# scraper/main.py 
import time
import sys
from datetime import datetime, timezone
from typing import List, Dict, Any

# Core imports
from core.config import config
from core.database import db
from core.browser import BrowserManager

# Scrapers
from scrapers.live_scraper import LiveScraper
from scrapers.scheduled_scraper import ScheduledScraper

# Processors (using global instances)
from processors import match_processor, competition_processor

# Utils (using global instances)
from utils import get_logger, scraper_logger

logger = get_logger(__name__)

class MainScraper:
    """Main scraper orchestrator"""
    
    def __init__(self):
        self.browser = None
        self.stats = {
            'start_time': None,
            'live_matches': 0,
            'scheduled_matches': 0,
            'total_processed': 0,
            'stored_successfully': 0,
            'storage_failed': 0,
            'zombies_cleaned': 0
        }
    
    def setup(self) -> bool:
        """Setup scraper components"""
        try:
            logger.info("🔧 Setting up scraper components...")
            
            # Database health check
            if not db.health_check():
                logger.error("❌ Database health check failed")
                return False
            
            logger.info("🔧 Database OK, checking performance...")
            if not db.performance_check():
                logger.warning("⚠️ Database performance issues detected")
            
            # Setup browser
            logger.info("🔧 Starting browser...")
            self.browser = BrowserManager()
            
            if not self.browser.health_check():
                logger.warning("⚠️ Browser health issues detected")
            
            logger.info("✅ Scraper setup completed")
            return True
            
        except Exception as e:
            logger.error(f"❌ Scraper setup failed: {e}")
            return False
    
    def cleanup_phase(self) -> int:
        """Phase 1: Cleanup old and zombie matches"""
        logger.info("🧹 Phase 1: Database cleanup...")
        
        # Force finish very old live matches
        old_count = db.force_finish_old_matches(hours_old=2)
        
        # Clean zombie matches
        zombie_count = db.cleanup_zombie_matches(hours_old=config.ZOMBIE_HOUR_LIMIT)
        
        total_cleaned = old_count + zombie_count
        self.stats['zombies_cleaned'] = total_cleaned
        
        logger.info(f"✅ Cleanup completed: {total_cleaned} matches cleaned")
        return total_cleaned
    
    def update_priorities_phase(self) -> int:
        """Phase 0: Update competition priorities"""
        logger.info("⭐ Phase 0: Updating competition priorities...")
        
        updated_count = competition_processor.update_all_competition_priorities()
        
        logger.info(f"✅ Priority update completed: {updated_count} competitions updated")
        return updated_count
    
    def fetch_phase(self) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        """Phase 2: Fetch fresh data"""
        logger.info("📡 Phase 2: Fetching fresh data...")
        
        # Browser health check before fetch
        if not self.browser.health_check():
            logger.warning("⚠️ Browser health issues before fetch, continuing anyway...")
        
        # Fetch live matches
        logger.info("📡 Fetching live matches...")
        live_scraper = LiveScraper(self.browser)
        live_matches = live_scraper.scrape()
        self.stats['live_matches'] = len(live_matches)
        
        # Fetch scheduled matches for today
        logger.info(f"📡 Got {len(live_matches)} live matches, fetching scheduled...")
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        scheduled_scraper = ScheduledScraper(self.browser, today)
        scheduled_matches = scheduled_scraper.scrape()
        self.stats['scheduled_matches'] = len(scheduled_matches)
        
        logger.info(f"✅ Fetch completed: {len(live_matches)} live, {len(scheduled_matches)} scheduled")
        return live_matches, scheduled_matches
    
    def process_phase(self, live_matches: List[Dict[str, Any]], 
                     scheduled_matches: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Phase 3: Process and prepare data"""
        logger.info("⚙️ Phase 3: Processing data...")
        
        # Combine all matches
        all_matches = live_matches + scheduled_matches
        self.stats['total_processed'] = len(all_matches)
        
        if not all_matches:
            logger.warning("⚠️ No matches to process")
            return []
        
        logger.info(f"⚙️ Processing {len(all_matches)} matches...")
        
        # Debug minute calculations for live matches
        live_only = [m for m in all_matches if m.get('status') in ['live', 'ht']]
        if live_only:
            match_processor.debug_minute_calculations(live_only)
        
        # Prepare for database
        db_ready_matches = match_processor.prepare_for_database(all_matches)
        
        logger.info(f"✅ Processing completed: {len(db_ready_matches)} matches ready for storage")
        return db_ready_matches
    
    def storage_phase(self, matches: List[Dict[str, Any]]) -> tuple[int, int]:
        """Phase 4: Store matches in database"""
        logger.info("💾 Phase 4: Storing matches...")
        
        if not matches:
            logger.warning("⚠️ No matches to store")
            return 0, 0
        
        logger.info(f"💾 Storing {len(matches)} matches...")
        
        # Store with batch upsert
        success_count, failed_count = db.batch_upsert_matches(matches)
        
        self.stats['stored_successfully'] = success_count
        self.stats['storage_failed'] = failed_count
        
        logger.info(f"✅ Storage completed: {success_count} stored, {failed_count} failed")
        return success_count, failed_count
    
    def final_cleanup_phase(self) -> int:
        """Phase 5: Final cleanup"""
        logger.info("🧹 Phase 5: Final cleanup...")
        
        # Final zombie cleanup
        final_zombies = db.cleanup_zombie_matches(hours_old=config.ZOMBIE_HOUR_LIMIT)
        
        # Browser cleanup
        if self.browser:
            self.browser.cleanup_resources()
        
        logger.info(f"✅ Final cleanup completed: {final_zombies} additional zombies cleaned")
        return final_zombies
    
    def run(self) -> bool:
        """Run complete scraping process"""
        self.stats['start_time'] = time.time()
        scraper_logger.log_scraper_start()
        
        try:
            # Setup
            if not self.setup():
                logger.error("❌ Setup failed")
                return False
            
            # Phase 0: Update priorities
            self.update_priorities_phase()
            
            # Phase 1: Cleanup
            self.cleanup_phase()
            
            # Phase 2: Fetch data
            live_matches, scheduled_matches = self.fetch_phase()
            
            # Check if we got any data
            if not live_matches and not scheduled_matches:
                logger.error("❌ No data fetched, aborting...")
                return False
            
            # Phase 3: Process data
            processed_matches = self.process_phase(live_matches, scheduled_matches)
            
            if not processed_matches:
                logger.error("❌ No matches processed, aborting...")
                return False
            
            # Phase 4: Store data
            success_count, failed_count = self.storage_phase(processed_matches)
            
            # Phase 5: Final cleanup
            self.final_cleanup_phase()
            
            # Check success rate
            success_rate = (success_count / len(processed_matches)) * 100 if processed_matches else 0
            
            if success_rate < 90:
                logger.warning(f"⚠️ Low success rate ({success_rate:.1f}%)!")
                return False
            
            logger.info(f"✅ Success! {success_count} matches stored")
            return True
            
        except Exception as e:
            logger.error(f"❌ Scraper failed: {e}")
            import traceback
            traceback.print_exc()
            return False
        
        finally:
            # Always cleanup browser
            if self.browser:
                self.browser.close()
            
            # Log completion
            elapsed = time.time() - self.stats['start_time']
            scraper_logger.log_scraper_end(True, elapsed, self.stats)
    
    def get_summary(self) -> Dict[str, Any]:
        """Get scraping summary"""
        elapsed = time.time() - self.stats['start_time'] if self.stats['start_time'] else 0
        success_rate = (self.stats['stored_successfully'] / self.stats['total_processed'] * 100) if self.stats['total_processed'] else 0
        
        return {
            'duration': f"{elapsed:.2f}s",
            'success_rate': f"{success_rate:.1f}%",
            'live_matches': self.stats['live_matches'],
            'scheduled_matches': self.stats['scheduled_matches'],
            'total_processed': self.stats['total_processed'],
            'stored_successfully': self.stats['stored_successfully'],
            'storage_failed': self.stats['storage_failed'],
            'zombies_cleaned': self.stats['zombies_cleaned']
        }

def main():
    """Main entry point"""
    logger.info("🚀 Starting Enhanced SofaScore Scraper...")
    
    try:
        scraper = MainScraper()
        success = scraper.run()
        
        # Get summary
        summary = scraper.get_summary()
        
        # Print results to stdout
        if success:
            print(f"SUCCESS: {summary['live_matches']} live, {summary['scheduled_matches']} scheduled, {summary['total_processed']} total processed in {summary['duration']}")
        else:
            print(f"FAILED: {summary['success_rate']} success rate, {summary['total_processed']} processed")
        
        # Print detailed summary
        print("\n" + "="*50)
        if success:
            print("✅ SCRAPER COMPLETED SUCCESSFULLY")
        else:
            print("❌ SCRAPER COMPLETED WITH ISSUES")
        
        print("="*50)
        for key, value in summary.items():
            print(f"{key.replace('_', ' ').title()}: {value}")
        print("="*50)
        
        if success:
            logger.info("🎉 Enhanced scraper completed successfully!")
            sys.exit(0)
        else:
            logger.error("⚠️ Scraper completed with issues")
            sys.exit(1)
            
    except KeyboardInterrupt:
        print("INTERRUPTED: Scraper stopped by user")
        logger.info("🛑 Scraper interrupted by user")
        sys.exit(130)
    except Exception as e:
        print(f"ERROR: Critical scraper failure: {e}")
        logger.error(f"🚨 Critical scraper failure: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()