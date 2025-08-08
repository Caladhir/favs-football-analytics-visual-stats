# instant_fix.py - HITNO ČIŠĆENJE
from datetime import datetime, timezone, timedelta
import sys
import os
sys.path.append('scraper')
from supabase_client import supabase

def instant_cleanup():
    try:
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(hours=2)
        
        print(f"[INSTANT FIX] Cleaning all live/ht matches older than {cutoff}")
        
        # Direktno update bez problema s kolonama
        result = supabase.table("matches").update({
            "status": "finished",
            "minute": None
        }).in_("status", ["live", "ht"]).lt("start_time", cutoff.isoformat()).execute()
        
        print(f"[SUCCESS] Fixed {len(result.data)} zombie matches!")
        
        # Provjeri koliko još ima
        remaining = supabase.table("matches").select("id").in_("status", ["live", "ht"]).lt("start_time", cutoff.isoformat()).execute()
        print(f"[INFO] Remaining zombies: {len(remaining.data)}")
        
    except Exception as e:
        print(f"[ERROR] {e}")

if __name__ == "__main__":
    instant_cleanup()