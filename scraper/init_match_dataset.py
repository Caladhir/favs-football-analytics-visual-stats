from sofascore_scraper import fetch_data, parse_matches, store_matches
from datetime import datetime, timedelta

# Definiraj koliko dana unazad i unaprijed želiš povući
DAYS_BACK = 365 * 2   # zadnje 2 godine
DAYS_FORWARD = 365    # 1 godina unaprijed

def run_bulk_scrape():
    today = datetime.now()
    all_matches = []
    total_count = 0

    for delta in range(-DAYS_BACK, DAYS_FORWARD + 1):
        date = (today + timedelta(days=delta)).strftime("%Y-%m-%d")
        try:
            print(f"[INFO] Fetching: {date}")
            data = fetch_data(f"scheduled-events/{date}")
            if not data:
                print(f"[WARN] No data returned for {date}")
                continue

            parsed = parse_matches(data.get("events", []), live=False)
            match_count = len(parsed)
            total_count += match_count

            print(f"[INFO] ✓ {match_count} utakmica na dan {date}")
            all_matches.extend(parsed)

        except Exception as e:
            print(f"[ERROR] Failed for {date}: {e}")

    print(f"[INFO] Ukupno pronađeno {total_count} utakmica. Spremam u Supabase...")
    store_matches(all_matches)
    print("[OK] Gotovo.")

if __name__ == "__main__":
    run_bulk_scrape()
