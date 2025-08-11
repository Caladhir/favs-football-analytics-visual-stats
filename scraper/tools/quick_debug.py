# scraper/tools/quick_debug.py - BRZA PROVJERA STANJA BAZE
import sys
from pathlib import Path
from datetime import datetime, timezone, timedelta
from collections import Counter

sys.path.append(str(Path(__file__).parent.parent))

from core.database import db
from utils.logger import get_logger

logger = get_logger(__name__)

def quick_status_check():
    """Brza provjera stanja live utakmica"""
    print("🔍 QUICK LIVE MATCHES STATUS CHECK")
    print("="*50)
    
    try:
        # Get all live status matches
        result = db.client.table("matches").select(
            "id", "home_team", "away_team", "start_time", "status", 
            "competition", "updated_at"
        ).in_("status", ["live", "ht", "inprogress", "halftime"]).execute()
        
        matches = result.data
        now = datetime.now(timezone.utc)
        
        print(f"📊 Total 'live' status matches: {len(matches)}")
        
        if not matches:
            print("✅ No live matches found")
            return
        
        # Analyze by time
        valid_live = []
        zombies = []
        future = []
        
        for match in matches:
            try:
                start_time = datetime.fromisoformat(match['start_time'].replace('Z', '+00:00'))
                hours_elapsed = (now - start_time).total_seconds() / 3600
                
                if hours_elapsed < -0.25:
                    future.append((match, hours_elapsed))
                elif hours_elapsed > 3:
                    zombies.append((match, hours_elapsed))
                else:
                    valid_live.append((match, hours_elapsed))
                    
            except Exception as e:
                print(f"❌ Invalid match data: {match.get('home_team')} vs {match.get('away_team')}")
        
        print(f"✅ Valid live (0-3h): {len(valid_live)}")
        print(f"🧟 Zombies (>3h old): {len(zombies)}")
        print(f"🔮 Future matches: {len(future)}")
        
        # Show valid live matches
        if valid_live:
            print(f"\n🔴 VALID LIVE MATCHES ({len(valid_live)}):")
            for i, (match, hours) in enumerate(valid_live[:10], 1):
                print(f"  {i}. {match['home_team']} vs {match['away_team']} ({hours:.1f}h ago)")
            if len(valid_live) > 10:
                print(f"  ... and {len(valid_live) - 10} more")
        
        # Show top zombies
        if zombies:
            print(f"\n🧟 TOP ZOMBIE MATCHES ({len(zombies)}):")
            sorted_zombies = sorted(zombies, key=lambda x: x[1], reverse=True)
            for i, (match, hours) in enumerate(sorted_zombies[:5], 1):
                print(f"  {i}. {match['home_team']} vs {match['away_team']} ({hours:.1f}h old!)")
        
        # Analyze duplicates quickly
        signatures = []
        for match in matches:
            try:
                start_time = datetime.fromisoformat(match['start_time'].replace('Z', '+00:00'))
                normalized_time = start_time.replace(minute=0, second=0, microsecond=0)
                sig = f"{match['home_team']}|{match['away_team']}|{normalized_time}|{match.get('competition', '')}"
                signatures.append(sig)
            except:
                pass
        
        signature_counts = Counter(signatures)
        duplicates = {k: v for k, v in signature_counts.items() if v > 1}
        
        if duplicates:
            print(f"\n🚨 DUPLICATE ANALYSIS:")
            print(f"Total matches: {len(matches)}")
            print(f"Unique signatures: {len(signature_counts)}")
            print(f"Duplicate groups: {len(duplicates)}")
            
            print("\nTop duplicates:")
            for i, (sig, count) in enumerate(sorted(duplicates.items(), key=lambda x: x[1], reverse=True)[:5], 1):
                teams = sig.split('|')[:2]
                print(f"  {i}. {teams[0]} vs {teams[1]}: {count} copies")
        else:
            print(f"\n✅ No obvious duplicates detected")
        
    except Exception as e:
        print(f"❌ Error: {e}")

def cleanup_zombies_now():
    """Odmah očisti zombie utakmice"""
    print("\n🧹 CLEANING ZOMBIE MATCHES NOW...")
    
    try:
        cleaned = db.cleanup_zombie_matches(hours_old=3)
        print(f"✅ Cleaned {cleaned} zombie matches")
        return cleaned
    except Exception as e:
        print(f"❌ Cleanup failed: {e}")
        return 0

def main():
    """Main function"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Quick debug of live matches')
    parser.add_argument('--cleanup', action='store_true', help='Also cleanup zombies')
    args = parser.parse_args()
    
    quick_status_check()
    
    if args.cleanup:
        cleaned = cleanup_zombies_now()
        if cleaned > 0:
            print("\n" + "="*50)
            print("🔄 RUNNING STATUS CHECK AFTER CLEANUP...")
            print("="*50)
            quick_status_check()

if __name__ == "__main__":
    main()