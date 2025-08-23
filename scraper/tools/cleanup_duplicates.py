# scraper/tools/cleanup_duplicates.py - ČISTI DUPLIKATE IZ BAZE
import sys
import argparse
from pathlib import Path
from datetime import datetime, timezone
from collections import defaultdict

# Add scraper to path
sys.path.append(str(Path(__file__).parent.parent))

from core.database import db
from utils.logger import get_logger

logger = get_logger(__name__)

class DuplicateCleanup:
    """Čisti duplikate iz matches table"""
    
    def __init__(self):
        self.stats = {
            'total_matches': 0,
            'duplicate_groups': 0,
            'duplicates_removed': 0,
            'kept_matches': 0
        }
    
    def find_duplicates(self) -> dict:
        """Pronađi duplikate u bazi"""
        logger.info("🔍 Searching for duplicate matches...")
        
        try:
            # Dohvati sve utakmice
            matches = db.client.table("matches").select(
                "id", "home_team", "away_team", "start_time", "competition", 
                "status", "updated_at", "source"
            ).execute()
            
            self.stats['total_matches'] = len(matches.data)
            logger.info(f"📊 Found {self.stats['total_matches']} total matches in database")
            
            # Grupiraj po ključnim atributima
            match_groups = defaultdict(list)
            
            for match in matches.data:
                # Kreiraj signature za grupiranje
                start_time = match.get('start_time', '')
                if start_time:
                    # Normiraj na sat (ignore minute differences)
                    try:
                        dt = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
                        normalized_time = dt.replace(minute=0, second=0, microsecond=0).isoformat()
                    except Exception:
                        normalized_time = start_time[:13]  # fallback: YYYY-MM-DDTHH
                else:
                    normalized_time = "unknown"
                signature = (
                    (match.get('home_team') or '').strip().lower(),
                    (match.get('away_team') or '').strip().lower(),
                    normalized_time,
                    (match.get('competition') or '').strip().lower()
                )
                match_groups[signature].append(match)
            
            # Filtriraj samo grupe s duplikatima
            duplicate_groups = {k: v for k, v in match_groups.items() if len(v) > 1}
            
            self.stats['duplicate_groups'] = len(duplicate_groups)
            
            logger.info(f"🚨 Found {len(duplicate_groups)} groups with duplicates:")
            
            # Prikaži top 10 najgorih slučajeva
            sorted_groups = sorted(duplicate_groups.items(), key=lambda x: len(x[1]), reverse=True)
            
            for i, (signature, matches) in enumerate(sorted_groups[:10]):
                home, away, time, comp = signature
                logger.info(f"  {i+1}. {home.title()} vs {away.title()} ({comp.title()}): {len(matches)} copies")
            
            if len(sorted_groups) > 10:
                logger.info(f"  ... and {len(sorted_groups) - 10} more duplicate groups")
            
            return duplicate_groups
            
        except Exception as e:
            logger.error(f"❌ Failed to find duplicates: {e}")
            return {}
    
    def cleanup_duplicates(self, duplicate_groups: dict, dry_run: bool = True) -> int:
        """Očisti duplikate - zadrži najnoviji"""
        if not duplicate_groups:
            logger.info("✅ No duplicates to clean")
            return 0
        
        logger.info(f"🧹 Cleaning {len(duplicate_groups)} duplicate groups (dry_run={dry_run})...")
        
        removed_count = 0
        
        for signature, matches in duplicate_groups.items():
            home, away, time, comp = signature
            
            # Sortiraj po updated_at (najnoviji prvo)
            sorted_matches = sorted(
                matches, 
                key=lambda x: x.get('updated_at', ''), 
                reverse=True
            )
            
            # Zadrži prvi (najnoviji), obriši ostale
            to_keep = sorted_matches[0]
            to_remove = sorted_matches[1:]
            
            logger.info(f"  📌 {home.title()} vs {away.title()}: keeping 1, removing {len(to_remove)}")
            logger.debug(f"    Keeping: {to_keep['id']} (updated: {to_keep.get('updated_at', 'unknown')})")
            
            for match in to_remove:
                if not dry_run:
                    try:
                        db.client.table("matches").delete().eq("id", match["id"]).execute()
                        removed_count += 1
                        logger.info(f"    Removed: {match['id']}")
                    except Exception as e:
                        logger.error(f"    Failed to remove {match['id']}: {e}")
                else:
                    removed_count += 1
                    logger.debug(f"    Would remove: {match['id']}")
        
        self.stats['duplicates_removed'] = removed_count
        self.stats['kept_matches'] = self.stats['total_matches'] - removed_count
        
        if dry_run:
            logger.info(f"🔍 DRY RUN: Would remove {removed_count} duplicate matches")
        else:
            logger.info(f"✅ CLEANED: Removed {removed_count} duplicate matches")
        
        return removed_count
    
    def run_cleanup(self, dry_run: bool = True):
        """Pokreni potpuni cleanup process"""
        logger.info("🚀 Starting duplicate cleanup process...")
        
        # 1. Find duplicates
        duplicate_groups = self.find_duplicates()
        
        if not duplicate_groups:
            logger.info("🎉 No duplicates found! Database is clean.")
            return
        
        # 2. Clean duplicates
        self.cleanup_duplicates(duplicate_groups, dry_run=dry_run)
        
        # 3. Print summary
        self.print_summary(dry_run)
    
    def print_summary(self, dry_run: bool):
        """Print cleanup summary"""
        print("\n" + "="*60)
        if dry_run:
            print("🔍 DUPLICATE CLEANUP ANALYSIS (DRY RUN)")
        else:
            print("✅ DUPLICATE CLEANUP COMPLETED")
        print("="*60)
        
        print(f"Total matches in database: {self.stats['total_matches']:,}")
        print(f"Duplicate groups found: {self.stats['duplicate_groups']:,}")
        print(f"Duplicates to remove: {self.stats['duplicates_removed']:,}")
        print(f"Matches that would remain: {self.stats['kept_matches']:,}")
        
        if self.stats['total_matches'] > 0:
            duplicate_rate = (self.stats['duplicates_removed'] / self.stats['total_matches']) * 100
            print(f"Duplication rate: {duplicate_rate:.1f}%")
        
        if dry_run:
            print("\n💡 To actually remove duplicates, run with --execute flag")
        
        print("="*60)

def main():
    """Main cleanup function"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Clean duplicate matches from database')
    parser.add_argument('--execute', action='store_true', 
                       help='Actually remove duplicates (default is dry run)')
    args = parser.parse_args()
    
    try:
        cleanup = DuplicateCleanup()
        cleanup.run_cleanup(dry_run=not args.execute)
        
    except Exception as e:
        logger.error(f"❌ Cleanup failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()