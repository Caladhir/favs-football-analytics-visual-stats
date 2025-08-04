# scraper/init_match_dataset.py
from sofascore_scraper import fetch_data, parse_matches, store_matches
from datetime import datetime, timedelta

# Definiraj koliko dana unazad i unaprijed želiš povući
DAYS_BACK = 365 * 2   # zadnje 2 godine
DAYS_FORWARD = 365    # 1 godina unaprijed

def run_bulk_scrape():
    today = datetime.now()
    all_matches = []

    for delta in range(-DAYS_BACK, DAYS_FORWARD + 1):
        date = (today + timedelta(days=delta)).strftime("%Y-%m-%d")
        try:
            print(f"[INFO] Fetching: {date}")
            data = fetch_data(f"scheduled-events/{date}")
            parsed = parse_matches(data.get("events", []), live=False)
            all_matches.extend(parsed)
        except Exception as e:
            print(f"[ERROR] Failed for {date}: {e}")

    print(f"[INFO] Ukupno pronađeno {len(all_matches)} utakmica. Spremam u Supabase...")
    store_matches(all_matches)
    print("[OK] Gotovo.")

if __name__ == "__main__":
    run_bulk_scrape()
