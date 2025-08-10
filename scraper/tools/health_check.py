# scraper/tools/health_check.py - ISPRAVLJENA VERZIJA
import time
import sys
from pathlib import Path
from datetime import datetime, timezone, timedelta

# 🔧 ISPRAVKA: Dodaj parent directory u Python path
scraper_dir = Path(__file__).parent.parent
sys.path.insert(0, str(scraper_dir))

# Sada možemo importirati module
try:
    from core.database import db
    from core.config import config
    from utils.logger import get_logger
except ImportError as e:
    print(f"❌ Import error: {e}")
    print(f"Working directory: {Path.cwd()}")
    print(f"Scraper directory: {scraper_dir}")
    print(f"Python path: {sys.path[:3]}")
    sys.exit(1)

logger = get_logger(__name__)

class HealthChecker:
    """Comprehensive health checker for scraper system"""
    
    def __init__(self):
        self.checks_passed = 0
        self.checks_failed = 0
        self.warnings = []
        self.errors = []
    
    def check_database_connection(self) -> bool:
        """Check database connectivity"""
        logger.info("🔍 Checking database connection...")
        
        try:
            if db.health_check():
                logger.info("✅ Database connection OK")
                self.checks_passed += 1
                return True
            else:
                self.errors.append("Database connection failed")
                self.checks_failed += 1
                return False
        except Exception as e:
            self.errors.append(f"Database check error: {e}")
            self.checks_failed += 1
            return False
    
    def check_database_performance(self) -> bool:
        """Check database performance"""
        logger.info("🔍 Checking database performance...")
        
        try:
            if db.performance_check():
                logger.info("✅ Database performance OK")
                self.checks_passed += 1
                return True
            else:
                self.warnings.append("Database performance issues detected")
                self.checks_passed += 1  # Not critical
                return True
        except Exception as e:
            self.warnings.append(f"Performance check failed: {e}")
            self.checks_passed += 1
            return True
    
    def check_data_freshness(self) -> bool:
        """Check when data was last updated"""
        logger.info("🔍 Checking data freshness...")
        
        try:
            # Check latest live match updates
            result = db.client.table("matches").select("updated_at", "status").in_(
                "status", ["live", "ht"]
            ).order("updated_at", desc=True).limit(1).execute()
            
            if result.data:
                last_update = datetime.fromisoformat(result.data[0]["updated_at"].replace("Z", "+00:00"))
                minutes_ago = (datetime.now(timezone.utc) - last_update).total_seconds() / 60
                
                logger.info(f"Last live match update: {minutes_ago:.1f} minutes ago")
                
                if minutes_ago > 10:  # Older than 10 minutes
                    self.warnings.append(f"Live data is {minutes_ago:.1f} minutes old")
                else:
                    logger.info("✅ Live data is fresh")
                
                self.checks_passed += 1
                return True
            else:
                logger.info("No live matches found - data freshness OK")
                self.checks_passed += 1
                return True
                
        except Exception as e:
            self.errors.append(f"Data freshness check failed: {e}")
            self.checks_failed += 1
            return False
    
    def check_live_count_consistency(self) -> bool:
        """Check live count consistency"""
        logger.info("🔍 Checking live count consistency...")
        
        try:
            # Raw count
            raw_result = db.client.table("matches").select("count", count="exact").in_(
                "status", ["live", "ht", "inprogress", "halftime"]
            ).execute()
            
            raw_count = raw_result.count if hasattr(raw_result, 'count') else 0
            
            # Valid count (with filter)
            valid_result = db.client.table("matches").select("start_time", "status").in_(
                "status", ["live", "ht", "inprogress", "halftime"]
            ).execute()
            
            now = datetime.now(timezone.utc)
            valid_count = 0
            
            for match in valid_result.data:
                start_time = datetime.fromisoformat(match["start_time"].replace("Z", "+00:00"))
                hours_elapsed = (now - start_time).total_seconds() / 3600
                
                # Same filter as frontend (10h limit)
                if hours_elapsed <= 10:  # Using relaxed limit directly
                    valid_count += 1
            
            logger.info(f"Live matches: {raw_count} raw → {valid_count} valid")
            
            # Check for large difference
            difference = raw_count - valid_count
            if difference > 10:
                self.warnings.append(f"{difference} zombie matches detected")
            else:
                logger.info("✅ Live count consistent")
            
            self.checks_passed += 1
            return True
            
        except Exception as e:
            self.errors.append(f"Live count check failed: {e}")
            self.checks_failed += 1
            return False
    
    def check_configuration(self) -> bool:
        """Check configuration validity"""
        logger.info("🔍 Checking configuration...")
        
        try:
            config.validate_config()
            logger.info("✅ Configuration is valid")
            self.checks_passed += 1
            return True
        except Exception as e:
            self.errors.append(f"Configuration error: {e}")
            self.checks_failed += 1
            return False
    
    def check_zombie_matches(self) -> bool:
        """Check for zombie matches"""
        logger.info("🔍 Checking for zombie matches...")
        
        try:
            now = datetime.now(timezone.utc)
            cutoff_time = now - timedelta(hours=3)  # Using direct value instead of config
            
            zombie_result = db.client.table("matches").select("count", count="exact").in_(
                "status", ["live", "ht"]
            ).lt("start_time", cutoff_time.isoformat()).execute()
            
            zombie_count = zombie_result.count if hasattr(zombie_result, 'count') else 0
            
            if zombie_count > 0:
                self.warnings.append(f"{zombie_count} zombie matches found")
                logger.warning(f"⚠️ {zombie_count} zombie matches detected")
            else:
                logger.info("✅ No zombie matches found")
            
            self.checks_passed += 1
            return True
            
        except Exception as e:
            self.errors.append(f"Zombie check failed: {e}")
            self.checks_failed += 1
            return False
    
    def check_competition_priorities(self) -> bool:
        """Check competition priority distribution"""
        logger.info("🔍 Checking competition priorities...")
        
        try:
            competitions = db.client.table("competitions").select("name", "priority").execute()
            
            priority_stats = {
                'total': len(competitions.data),
                'top_tier': 0,    # Priority > 80
                'mid_tier': 0,    # Priority 50-80
                'low_tier': 0,    # Priority < 50
                'no_priority': 0  # Priority = 0 or None
            }
            
            for comp in competitions.data:
                priority = comp.get("priority", 0)
                if priority > 80:
                    priority_stats['top_tier'] += 1
                elif priority >= 50:
                    priority_stats['mid_tier'] += 1
                elif priority > 0:
                    priority_stats['low_tier'] += 1
                else:
                    priority_stats['no_priority'] += 1
            
            logger.info(f"Competition priorities: {priority_stats}")
            
            if priority_stats['no_priority'] > priority_stats['total'] * 0.1:  # More than 10%
                self.warnings.append(f"{priority_stats['no_priority']} competitions without priority")
            
            logger.info("✅ Competition priorities checked")
            self.checks_passed += 1
            return True
            
        except Exception as e:
            self.errors.append(f"Priority check failed: {e}")
            self.checks_failed += 1
            return False
    
    def run_all_checks(self) -> bool:
        """Run all health checks"""
        logger.info("🏥 Starting comprehensive health check...")
        
        checks = [
            self.check_configuration,
            self.check_database_connection,
            self.check_database_performance,
            self.check_data_freshness,
            self.check_live_count_consistency,
            self.check_zombie_matches,
            self.check_competition_priorities
        ]
        
        for check in checks:
            try:
                check()
            except Exception as e:
                logger.error(f"Check {check.__name__} failed: {e}")
                self.checks_failed += 1
        
        return self.checks_failed == 0
    
    def print_summary(self):
        """Print health check summary"""
        total_checks = self.checks_passed + self.checks_failed
        
        print("\n" + "="*60)
        print("🏥 HEALTH CHECK SUMMARY")
        print("="*60)
        print(f"Total checks: {total_checks}")
        print(f"✅ Passed: {self.checks_passed}")
        print(f"❌ Failed: {self.checks_failed}")
        print(f"⚠️ Warnings: {len(self.warnings)}")
        
        if self.warnings:
            print("\n⚠️ WARNINGS:")
            for warning in self.warnings:
                print(f"  - {warning}")
        
        if self.errors:
            print("\n❌ ERRORS:")
            for error in self.errors:
                print(f"  - {error}")
        
        if self.checks_failed == 0:
            print("\n🎉 ALL CHECKS PASSED!")
        else:
            print(f"\n⚠️ {self.checks_failed} CHECKS FAILED!")
        
        print("="*60)

def main():
    """Main health check function"""
    try:
        checker = HealthChecker()
        
        success = checker.run_all_checks()
        checker.print_summary()
        
        if success:
            logger.info("✅ All health checks passed")
            sys.exit(0)
        else:
            logger.error("❌ Some health checks failed")
            sys.exit(1)
            
    except Exception as e:
        print(f"❌ Health check failed to start: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()