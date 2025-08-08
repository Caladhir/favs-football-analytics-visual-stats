# scraper/init_match_dataset.py
from sofascore_scraper import fetch_data, parse_matches, store_matches
from datetime import datetime, timedelta
from tqdm import tqdm
import time

DAYS_BACK = 365 * 2  
DAYS_FORWARD = 365    
BATCH_SIZE = 1000

def batch_store_matches(matches, batch_size=BATCH_SIZE):
    success_count = 0
    error_count = 0
    for i in tqdm(range(0, len(matches), batch_size), desc="Upserting batches", unit="batch"):
        batch = matches[i:i + batch_size]
        for attempt in range(5):
            try:
                supabase.table("matches").upsert(batch, on_conflict=["id"]).execute()
                success_count += len(batch)
                break
            except Exception as e:
                print(f"[ERROR] Batch upsert failed (try {attempt+1}): {e}")
                time.sleep(2)
        else:
            error_count += len(batch)
            print("[ERROR] Permanently failed upsert for batch (data lost)")
    print(f"\n[OK] Uspješno spremljeno: {success_count}")
    print(f"[ERROR] Grešaka prilikom spremanja: {error_count}")
    print(" [DONE] Ukupno obrađeno:", success_count + error_count)

def run_bulk_scrape():
    today = datetime.now()
    all_matches = []
    total_count = 0
    total_days = DAYS_BACK + DAYS_FORWARD + 1

    print(f"[INFO] Ukupno dana za obradu: {total_days}")

    for delta in tqdm(range(-DAYS_BACK, DAYS_FORWARD + 1), desc="Fetching days", unit="day"):
        date = (today + timedelta(days=delta)).strftime("%Y-%m-%d")
        try:
            print(f"[INFO] Fetching: {date}")
            data = fetch_data(f"scheduled-events/{date}")
            if not data:
                print(f"[WARN] No data returned for {date}")
                continue

            parsed = parse_matches(data.get("events", []))
            match_count = len(parsed)
            total_count += match_count

            print(f"[INFO] ✓ {match_count} utakmica na dan {date}")
            all_matches.extend(parsed)

        except Exception as e:
            print(f"[ERROR] Failed for {date}: {e}")

    print(f"[INFO] Ukupno pronađeno {total_count} utakmica. Spremam u Supabase...")

    batch_store_matches(all_matches, batch_size=BATCH_SIZE)
    print("[OK] Gotovo.")

if __name__ == "__main__":
    run_bulk_scrape()
