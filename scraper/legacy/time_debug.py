# time_debug.py - DIJAGNOZA VREMENA
from datetime import datetime, timezone
import sys
sys.path.append('scraper')
from supabase_client import supabase

def debug_time():
    print("=== TIME DEBUG ===")
    print(f"System time (local): {datetime.now()}")
    print(f"System time (UTC): {datetime.now(timezone.utc)}")
    print(f"UTC timestamp: {datetime.now(timezone.utc).timestamp()}")
    
    # Provjeri neke utakmice iz baze
    print("\n=== SAMPLE MATCHES ===")
    matches = supabase.table("matches").select("home_team", "away_team", "start_time", "status").limit(5).execute()
    
    for match in matches.data:
        start_time_str = match['start_time']
        # Konvertuj string natrag u datetime
        if start_time_str.endswith('Z'):
            start_time_str = start_time_str[:-1] + '+00:00'
        elif '+00:00' not in start_time_str:
            start_time_str += '+00:00'
            
        start_time = datetime.fromisoformat(start_time_str)
        local_time = start_time.astimezone()  # Konvertuj u lokalno vrijeme
        
        print(f"{match['home_team']} vs {match['away_team']}")
        print(f"  DB time (UTC): {start_time}")
        print(f"  Local time: {local_time}")
        print(f"  Status: {match['status']}")
        print("---")

if __name__ == "__main__":
    debug_time()