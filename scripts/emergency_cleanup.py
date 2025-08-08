# emergency_cleanup.py - HITNO ČIŠĆENJE ZOMBIJA
from datetime import datetime, timezone, timedelta
import sys
import os
sys.path.append('scraper')
from supabase_client import supabase

def emergency_cleanup():
    try:
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(hours=2)  # Starije od 2 sata
        
        print(f"🧹 EMERGENCY CLEANUP - fixing zombies older than {cutoff}")
        
        # 1. Pronađi sve zombije
        zombies = supabase.table("matches").select("id", "home_team", "away_team", "start_time", "status").in_(
            "status", ["live", "ht"]
        ).lt("start_time", cutoff.isoformat()).execute()
        
        print(f"🚨 Found {len(zombies.data)} zombie matches:")
        for zombie in zombies.data[:10]:  # Prvi 10
            start_time = datetime.fromisoformat(zombie["start_time"].replace('Z', '+00:00'))
            hours_ago = (now - start_time).total_seconds() / 3600
            print(f"   - {zombie['home_team']} vs {zombie['away_team']} ({hours_ago:.1f}h ago)")
        
        if len(zombies.data) > 10:
            print(f"   ... and {len(zombies.data) - 10} more")
        
        # 2. Završi sve zombije
        if zombies.data:
            result = supabase.table("matches").update({
                "status": "finished",
                "status_type": "finished",
                "minute": None
            }).in_("status", ["live", "ht"]).lt("start_time", cutoff.isoformat()).execute()
            
            print(f"✅ Successfully finished {len(result.data)} zombie matches!")
        else:
            print("✅ No zombies found - all clean!")
        
        # 3. Provjeri preostale live utakmice
        remaining = supabase.table("matches").select("id", "home_team", "away_team", "start_time").in_(
            "status", ["live", "ht"]
        ).execute()
        
        print(f"\n📊 Remaining live/ht matches: {len(remaining.data)}")
        valid_live = 0
        for match in remaining.data:
            start_time = datetime.fromisoformat(match["start_time"].replace('Z', '+00:00'))
            hours_ago = (now - start_time).total_seconds() / 3600
            if hours_ago <= 2:
                valid_live += 1
        
        print(f"✅ Valid live matches (≤2h old): {valid_live}")
        print(f"🚨 Remaining zombies (>2h old): {len(remaining.data) - valid_live}")
        
    except Exception as e:
        print(f"❌ CLEANUP FAILED: {e}")

if __name__ == "__main__":
    emergency_cleanup()