# scripts/cleanup_zombie_matches.py
"""
Samostalni script za čišćenje zombie utakmica
Pokrenuti svakih 30 minuta kao cron job
"""
import sys
import os
from datetime import datetime, timezone, timedelta

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from scraper.supabase_client import supabase

def cleanup_zombie_matches():
    """Agresivno čišćenje zombie utakmica"""
    try:
        now = datetime.now(timezone.utc +2)  # Adjust for local timezone
        
        # Različiti cutoff vremena za različite statuse
        cutoff_2h = now - timedelta(hours=2)  # Za standardne utakmice
        cutoff_3h = now - timedelta(hours=3)  # Za produžetke
        cutoff_4h = now - timedelta(hours=4)  # Za sve ostalo
        
        print(f"🧹 CLEANUP STARTED at {now}")
        
        # 1. Završi sve 'live' utakmice starije od 2 sata
        live_result = supabase.table("matches").update({
            "status": "finished",
            "status_type": "finished",
            "minute": None,
            "updated_at": now.isoformat()
        }).eq("status", "live").lt("start_time", cutoff_2h.isoformat()).execute()
        
        print(f"✅ Finished {len(live_result.data)} old LIVE matches")
        
        # 2. Završi sve 'ht' utakmice starije od 2 sata  
        ht_result = supabase.table("matches").update({
            "status": "finished", 
            "status_type": "finished",
            "minute": None,
            "updated_at": now.isoformat()
        }).eq("status", "ht").lt("start_time", cutoff_2h.isoformat()).execute()
        
        print(f"✅ Finished {len(ht_result.data)} old HALFTIME matches")
        
        # 3. Završi sve ostale problematične statuse starije od 4 sata
        other_statuses = ['1h', '2h', 'inplay', '1st_half', '2nd_half']
        for status in other_statuses:
            result = supabase.table("matches").update({
                "status": "finished",
                "status_type": "finished", 
                "minute": None,
                "updated_at": now.isoformat()
            }).eq("status", status).lt("start_time", cutoff_4h.isoformat()).execute()
            
            if result.data:
                print(f"✅ Finished {len(result.data)} old {status.upper()} matches")
        
        # 4. Resetiraj minute za sve finished utakmice koje još imaju minutu
        minute_reset = supabase.table("matches").update({
            "minute": None,
            "updated_at": now.isoformat()
        }).eq("status", "finished").not_.is_("minute", "null").execute()
        
        if minute_reset.data:
            print(f"🔧 Reset minutes for {len(minute_reset.data)} finished matches")
        
        # 5. Provjeri ima li još zombie utakmica
        remaining_zombies = supabase.table("matches").select("id", "home_team", "away_team", "start_time", "status").in_(
            "status", ["live", "ht"] + other_statuses
        ).lt("start_time", cutoff_2h.isoformat()).execute()
        
        if remaining_zombies.data:
            print(f"⚠️  WARNING: {len(remaining_zombies.data)} zombie matches still remain!")
            for zombie in remaining_zombies.data[:5]:  # Show first 5
                print(f"   🧟 {zombie['home_team']} vs {zombie['away_team']} ({zombie['status']}) - {zombie['start_time']}")
        else:
            print("✅ No zombie matches remaining")
        
        print(f"🏁 CLEANUP COMPLETED at {datetime.now(timezone.utc)+2}")
        return True
        
    except Exception as e:
        print(f"❌ CLEANUP FAILED: {e}")
        return False

def get_stats():
    """Prikaži statistike utakmica po statusima"""
    try:
        stats = supabase.table("matches").select("status", "start_time").execute()
        
        from collections import Counter
        status_count = Counter()
        now = datetime.now(timezone.utc)
        
        for match in stats.data:
            status = match["status"]
            start_time = datetime.fromisoformat(match["start_time"].replace("Z", "+00:00"))
            hours_diff = (now - start_time).total_seconds() / 3600
            
            if status in ["live", "ht"] and hours_diff > 2:
                status_count[f"{status}_ZOMBIE"] += 1
            else:
                status_count[status] += 1
        
        print("\n📊 MATCH STATUS STATISTICS:")
        for status, count in status_count.most_common():
            emoji = "🚨" if "ZOMBIE" in status else "✅"
            print(f"   {emoji} {status}: {count}")
        
    except Exception as e:
        print(f"❌ Stats failed: {e}")

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Cleanup zombie matches")
    parser.add_argument("--stats", action="store_true", help="Show statistics only")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be cleaned without actually cleaning")
    
    args = parser.parse_args()
    
    if args.stats:
        get_stats()
    else:
        success = cleanup_zombie_matches()
        get_stats()
        
        if not success:
            sys.exit(1)