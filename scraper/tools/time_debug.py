# scraper/tools/time_debug.py - ENHANCED TIME DEBUG
import sys
from pathlib import Path
from datetime import datetime, timezone

# Add scraper to path
sys.path.append(str(Path(__file__).parent.parent))

from core.database import db
from utils.logger import get_logger

logger = get_logger(__name__)

def debug_time_issues():
    """Debug time-related issues in matches"""
    logger.info("🕐 Starting time debug analysis...")
    
    print("="*60)
    print("🕐 TIME DEBUG ANALYSIS")
    print("="*60)
    print(f"System time (local): {datetime.now()}")
    print(f"System time (UTC): {datetime.now(timezone.utc)}")
    print(f"UTC timestamp: {datetime.now(timezone.utc).timestamp()}")
    
    # Check sample matches from database
    print("\n📊 SAMPLE MATCHES FROM DATABASE:")
    print("-"*60)
    
    try:
        matches = db.client.table("matches").select(
            "home_team", "away_team", "start_time", "status", "minute", "updated_at"
        ).order("start_time", desc=True).limit(10).execute()
        
        now = datetime.now(timezone.utc)
        
        for i, match in enumerate(matches.data, 1):
            start_time_str = match['start_time']
            
            # Convert string back to datetime
            if start_time_str.endswith('Z'):
                start_time = datetime.fromisoformat(start_time_str.replace('Z', '+00:00'))
            elif '+00:00' not in start_time_str:
                start_time = datetime.fromisoformat(start_time_str + '+00:00')
            else:
                start_time = datetime.fromisoformat(start_time_str)
            
            local_time = start_time.astimezone()  # Convert to local time
            
            # Time calculations
            hours_elapsed = (now - start_time).total_seconds() / 3600
            
            print(f"{i:2d}. {match['home_team']} vs {match['away_team']}")
            print(f"    DB time (UTC): {start_time}")
            print(f"    Local time: {local_time}")
            print(f"    Status: {match['status']}")
            print(f"    Minute: {match.get('minute', 'N/A')}")
            print(f"    Hours elapsed: {hours_elapsed:.1f}h")
            
            # Flag suspicious entries
            if match['status'] in ['live', 'ht'] and hours_elapsed > 3:
                print(f"    ⚠️ ZOMBIE MATCH (>3h old)")
            elif match['status'] in ['live', 'ht'] and hours_elapsed < -0.25:
                print(f"    ⚠️ FUTURE MATCH (starts in {abs(hours_elapsed):.1f}h)")
            
            print()
        
        # Check zombie statistics
        print("📊 ZOMBIE MATCH STATISTICS:")
        print("-"*60)
        
        cutoff_3h = now - timedelta(hours=3)
        cutoff_6h = now - timedelta(hours=6)
        cutoff_24h = now - timedelta(hours=24)
        
        # Check zombie statistics
        print("📊 ZOMBIE MATCH STATISTICS:")
        print("-"*60)
        
        from datetime import timedelta
        
        cutoff_3h = now - timedelta(hours=3)
        cutoff_6h = now - timedelta(hours=6)
        cutoff_24h = now - timedelta(hours=24)
        
        zombies_3h = db.client.table("matches").select("count", count="exact").in_(
            "status", ["live", "ht"]
        ).lt("start_time", cutoff_3h.isoformat()).execute()
        
        zombies_6h = db.client.table("matches").select("count", count="exact").in_(
            "status", ["live", "ht"]
        ).lt("start_time", cutoff_6h.isoformat()).execute()
        
        zombies_24h = db.client.table("matches").select("count", count="exact").in_(
            "status", ["live", "ht"]
        ).lt("start_time", cutoff_24h.isoformat()).execute()
        
        total_live = db.client.table("matches").select("count", count="exact").in_(
            "status", ["live", "ht"]
        ).execute()
        
        count_3h = zombies_3h.count if hasattr(zombies_3h, 'count') else 0
        count_6h = zombies_6h.count if hasattr(zombies_6h, 'count') else 0
        count_24h = zombies_24h.count if hasattr(zombies_24h, 'count') else 0
        count_total = total_live.count if hasattr(total_live, 'count') else 0
        
        print(f"Total live matches: {count_total}")
        print(f"Zombies >3h old: {count_3h}")
        print(f"Zombies >6h old: {count_6h}")
        print(f"Zombies >24h old: {count_24h}")
        
        if count_3h > 0:
            print(f"⚠️ {count_3h} zombie matches need cleanup!")
        else:
            print("✅ No zombie matches found")
        
        # Live matches by competition
        print("\n📊 LIVE MATCHES BY COMPETITION:")
        print("-"*60)
        
        live_by_comp = db.client.table("matches").select(
            "competition", "count", count="exact"
        ).in_("status", ["live", "ht"]).execute()
        
        # Group by competition (manual grouping since we can't use GROUP BY in Supabase select)
        live_matches_detailed = db.client.table("matches").select(
            "competition", "start_time", "home_team", "away_team"
        ).in_("status", ["live", "ht"]).execute()
        
        comp_counts = {}
        for match in live_matches_detailed.data:
            comp = match.get('competition', 'Unknown')
            comp_counts[comp] = comp_counts.get(comp, 0) + 1
        
        # Sort by count
        sorted_comps = sorted(comp_counts.items(), key=lambda x: x[1], reverse=True)
        
        for comp, count in sorted_comps[:10]:  # Top 10
            print(f"{comp}: {count} live matches")
        
        if len(sorted_comps) > 10:
            print(f"... and {len(sorted_comps) - 10} more competitions")
        
    except Exception as e:
        logger.error(f"❌ Time debug failed: {e}")
        print(f"❌ Error during time debug: {e}")
    
    print("="*60)

def check_specific_match(match_id: str):
    """Debug specific match by ID"""
    logger.info(f"🔍 Debugging match: {match_id}")
    
    try:
        result = db.client.table("matches").select("*").eq("id", match_id).execute()
        
        if not result.data:
            print("No match found.")
            return
        
        match = result.data[0]
        
        print(f"\n🔍 MATCH DETAILS: {match_id}")
        print("-"*50)
        print(f"Teams: {match['home_team']} vs {match['away_team']}")
        print(f"Competition: {match.get('competition', 'Unknown')}")
        print(f"Start time: {match['start_time']}")
        print(f"Status: {match['status']}")
        print(f"Status type: {match.get('status_type', 'Unknown')}")
        print(f"Minute: {match.get('minute', 'N/A')}")
        print(f"Score: {match.get('home_score', 0)} - {match.get('away_score', 0)}")
        print(f"Updated at: {match.get('updated_at', 'Unknown')}")
        print(f"Source: {match.get('source', 'Unknown')}")
        
        # Time analysis
        if match['start_time']:
            start_time = datetime.fromisoformat(match['start_time'].replace('Z', '+00:00'))
            now = datetime.now(timezone.utc)
            hours_elapsed = (now - start_time).total_seconds() / 3600
            print(f"    Hours elapsed since start: {hours_elapsed:.1f}h")
            
            if match['status'] in ['live', 'ht']:
                if hours_elapsed > 3:
                    print(f"⚠️ ZOMBIE: Match is {hours_elapsed:.1f}h old!")
                elif hours_elapsed < -0.25:
                    print(f"⚠️ FUTURE: Match is in the future!")
                else:
                    print("✅ Time looks normal for live match")
        
    except Exception as e:
        logger.error(f"❌ Failed to debug match {match_id}: {e}")

def main():
    """Main time debug function"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Debug time issues in matches')
    parser.add_argument('--match-id', help='Debug specific match by ID')
    args = parser.parse_args()
    
    if args.match_id:
        check_specific_match(args.match_id)
    else:
        debug_time_issues()

if __name__ == "__main__":
    main()