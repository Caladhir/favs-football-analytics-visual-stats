# scraper/bulk_entity_dump.py
from sofascore_scraper import fetch_data, store_detailed_match_data
from supabase_client import supabase

def fetch_all_match_ids():
    match_ids = []
    from_index = 0
    page_size = 1000

    while True:
        res = supabase.table("matches").select("id").range(from_index, from_index + page_size - 1).execute()
        if not res.data:
            break
        match_ids.extend([r["id"] for r in res.data])
        from_index += page_size

    return match_ids

def run_entity_dump():
    match_ids = fetch_all_match_ids()
    total = len(match_ids)
    success_count = 0
    skipped_count = 0

    for i, mid in enumerate(match_ids, 1):
        try:
            real_id = mid.split("_")[-1]
            print(f"[{i}/{total} - {round(i/total*100, 1)}%] Fetching event/{real_id}")
            raw = fetch_data(f"event/{real_id}")

            if not raw or "homeTeam" not in raw or "awayTeam" not in raw:
                print(f"[WARN] Preskačem match {mid} - nedostaje homeTeam/awayTeam.")
                skipped_count += 1
                continue

            fake_match = { "id": mid }
            store_detailed_match_data(fake_match, raw)
            success_count += 1

        except Exception as e:
            print(f"[ERROR] Failed to fetch/dump match {mid}: {e}")
            skipped_count += 1

    print(f"[DONE] Ukupno: {total} | Spremljeno: {success_count} | Preskočeno: {skipped_count}")

if __name__ == "__main__":
    run_entity_dump()
