# scraper/tools/nuclear_cleanup.py - SUPER AGRESIVNI CLEANUP ZA MASIVNE DUPLIKATE
import sys
import time
from pathlib import Path
from datetime import datetime, timezone
from collections import defaultdict

# Add scraper to path
sys.path.append(str(Path(__file__).parent.parent))

from core.database import db
from utils.logger import get_logger

logger = get_logger(__name__)

class NuclearCleanup:
    """Nuclear option - riješava masivne duplikate"""
    
    def __init__(self):
        self.stats = {
            'total_before': 0,
            'total_after': 0,
            'duplicates_removed': 0,
            'start_time': time.time()
        }
    
    def get_live_count(self):
        """Get current live count"""
        try:
            result = db.client.table("matches").select("count", count="exact").in_(
                "status", ["live", "ht", "inprogress", "halftime"]
            ).execute()
            return result.count if hasattr(result, 'count') else 0
        except:
            return 0
    
    def nuclear_duplicate_cleanup(self):
        """🚨 NUCLEAR OPTION: Agresivno uklanja sve duplikate"""
        print("🚨 NUCLEAR DUPLICATE CLEANUP STARTING...")
        print("="*60)
        
        self.stats['total_before'] = self.get_live_count()
        print(f"📊 Live matches before cleanup: {self.stats['total_before']}")
        
        try:
            # Get ALL live matches (ne samo 1000)
            print("🔍 Fetching ALL live matches...")
            
            all_live = []
            offset = 0
            batch_size = 1000
            
            while True:
                batch = db.client.table("matches").select(
                    "id", "home_team", "away_team", "start_time", "competition", 
                    "updated_at", "status", "minute"
                ).in_(
                    "status", ["live", "ht", "inprogress", "halftime"]
                ).range(offset, offset + batch_size - 1).execute()
                
                if not batch.data:
                    break
                    
                all_live.extend(batch.data)
                offset += batch_size
                
                if len(batch.data) < batch_size:
                    break
            
            print(f"📊 Fetched {len(all_live)} total live matches")
            
            # Group by STRICT signature
            groups = defaultdict(list)
            
            for match in all_live:
                try:
                    # SUPER STRICT signature - exact match detection
                    home = match['home_team'].strip().lower()
                    away = match['away_team'].strip().lower()
                    comp = match.get('competition', '').strip().lower()
                    
                    # Normalize start time to minute (not hour!)
                    start_dt = datetime.fromisoformat(match['start_time'].replace('Z', '+00:00'))
                    normalized_time = start_dt.replace(second=0, microsecond=0)  # Keep minute precision
                    
                    signature = f"{home}|{away}|{normalized_time.isoformat()}|{comp}"
                    groups[signature].append(match)
                    
                except Exception as e:
                    logger.warning(f"Skipping invalid match: {e}")
                    continue
            
            print(f"📊 Found {len(groups)} unique match signatures")
            
            # Find and destroy duplicates
            duplicates_found = 0
            removed_count = 0
            
            for signature, matches in groups.items():
                if len(matches) > 1:
                    duplicates_found += len(matches) - 1
                    
                    # Sort by updated_at DESC, keep most recent
                    sorted_matches = sorted(
                        matches, 
                        key=lambda x: x.get('updated_at', ''), 
                        reverse=True
                    )
                    
                    to_keep = sorted_matches[0]
                    to_remove = sorted_matches[1:]
                    
                    # Extract team names for logging
                    parts = signature.split('|')
                    home_name = parts[0].title()
                    away_name = parts[1].title()
                    
                    print(f"🔥 {home_name} vs {away_name}: removing {len(to_remove)} duplicates")
                    
                    # BATCH DELETE for speed
                    ids_to_remove = [match['id'] for match in to_remove]
                    
                    # Delete in batches of 50
                    for i in range(0, len(ids_to_remove), 50):
                        batch_ids = ids_to_remove[i:i+50]
                        
                        try:
                            # Use PostgreSQL IN operator for batch delete
                            result = db.client.table("matches").delete().in_("id", batch_ids).execute()
                            removed_count += len(batch_ids)
                            
                        except Exception as e:
                            # Fallback to individual deletes
                            logger.warning(f"Batch delete failed, trying individual: {e}")
                            for match_id in batch_ids:
                                try:
                                    db.client.table("matches").delete().eq("id", match_id).execute()
                                    removed_count += 1
                                except Exception as individual_e:
                                    logger.error(f"Failed to delete {match_id}: {individual_e}")
                        
                        # Small delay between batches
                        time.sleep(0.1)
            
            self.stats['duplicates_removed'] = removed_count
            self.stats['total_after'] = self.get_live_count()
            
            print(f"\n🎯 NUCLEAR CLEANUP RESULTS:")
            print("="*60)
            print(f"Before: {self.stats['total_before']} live matches")
            print(f"After: {self.stats['total_after']} live matches")
            print(f"Removed: {removed_count} duplicate matches")
            print(f"Duplicates found: {duplicates_found}")
            print(f"Expected unique: {len(groups)}")
            
            elapsed = time.time() - self.stats['start_time']
            print(f"Duration: {elapsed:.1f} seconds")
            
            if self.stats['total_after'] <= 50:
                print("🎉 SUCCESS! Live matches reduced to reasonable number!")
                return True
            else:
                print("⚠️ Still too many live matches - may need manual intervention")
                return False
                
        except Exception as e:
            logger.error(f"❌ Nuclear cleanup failed: {e}")
            return False
    
    def emergency_live_reset(self):
        """🚨 EMERGENCY: Mark all old live matches as finished"""
        print("\n🚨 EMERGENCY LIVE RESET...")
        print("="*60)
        
        try:
            now = datetime.now(timezone.utc)
            
            # Get all live matches
            all_live = db.client.table("matches").select(
                "id", "start_time", "home_team", "away_team"
            ).in_("status", ["live", "ht", "inprogress", "halftime"]).execute()
            
            if not all_live.data:
                print("✅ No live matches to reset")
                return 0
            
            reset_count = 0
            
            for match in all_live.data:
                try:
                    start_time = datetime.fromisoformat(match['start_time'].replace('Z', '+00:00'))
                    hours_elapsed = (now - start_time).total_seconds() / 3600
                    
                    # Reset matches older than 1 hour (very aggressive)
                    if hours_elapsed > 1:
                        db.client.table("matches").update({
                            "status": "finished",
                            "status_type": "finished",
                            "minute": None,
                            "updated_at": now.isoformat()
                        }).eq("id", match["id"]).execute()
                        
                        reset_count += 1
                        
                        if reset_count <= 10:  # Log first 10
                            print(f"🔄 Reset: {match['home_team']} vs {match['away_team']} ({hours_elapsed:.1f}h old)")
                        
                except Exception as e:
                    logger.warning(f"Failed to reset match {match['id']}: {e}")
            
            if reset_count > 10:
                print(f"... and {reset_count - 10} more matches reset")
                
            print(f"✅ Reset {reset_count} live matches to finished")
            return reset_count
            
        except Exception as e:
            logger.error(f"Emergency reset failed: {e}")
            return 0

def main():
    """Main nuclear cleanup"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Nuclear cleanup for massive duplicates')
    parser.add_argument('--confirm', action='store_true', 
                       help='Confirm you want to run nuclear cleanup')
    parser.add_argument('--emergency', action='store_true',
                       help='Also run emergency live reset')
    args = parser.parse_args()
    
    if not args.confirm:
        print("⚠️ This is a NUCLEAR cleanup that will aggressively remove duplicates!")
        print("⚠️ Use --confirm flag to proceed")
        print("⚠️ Use --emergency flag to also reset old live matches")
        return
    
    try:
        cleanup = NuclearCleanup()
        
        success = cleanup.nuclear_duplicate_cleanup()
        
        if args.emergency or not success:
            cleanup.emergency_live_reset()
            
            # Final count
            final_count = cleanup.get_live_count()
            print(f"\n🎯 FINAL RESULT: {final_count} live matches remaining")
        
    except Exception as e:
        logger.error(f"❌ Nuclear cleanup failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()