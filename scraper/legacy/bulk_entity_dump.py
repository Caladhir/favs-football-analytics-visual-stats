# scraper/legacy/bulk_entity_dump.py
from pathlib import Path
import sys
sys.path.append(str(Path(__file__).parent.parent))

from core.database import db
from processors.match_processor import store_detailed_match_data

# Koristi sofascore_id kao ključ

def fetch_all_match_sofascore_ids():
    sofascore_ids = []
    from_index = 0
    page_size = 1000
    while True:
        res = db.client.table("matches").select("sofascore_id").range(from_index, from_index + page_size - 1).execute()
        if not res.data:
            break
        sofascore_ids.extend([r["sofascore_id"] for r in res.data if r.get("sofascore_id")])
        from_index += page_size
    return sofascore_ids

# Pretpostavljamo da store_detailed_match_data radi upsert u sve povezane tablice

def run_entity_dump():
    sofascore_ids = fetch_all_match_sofascore_ids()
    total = len(sofascore_ids)
    success_count = 0
    skipped_count = 0

    for i, sid in enumerate(sofascore_ids, 1):
        try:
            print(f"[{i}/{total} - {round(i/total*100, 1)}%] Fetching event/{sid}")
            # fetch_data treba biti iz core/api ili processors, ovdje pretpostavljamo da je u match_processor
            from processors.match_processor import fetch_event_data
            raw = fetch_event_data(sid)

            if not raw or "homeTeam" not in raw or "awayTeam" not in raw:
                print(f"[WARN] Preskačem match sofascore_id={sid} - nedostaje homeTeam/awayTeam.")
                skipped_count += 1
                continue

            # fake_match je dict s sofascore_id
            fake_match = { "sofascore_id": sid }
            store_detailed_match_data(fake_match, raw)
            success_count += 1

        except Exception as e:
            print(f"[ERROR] Failed to fetch/dump match sofascore_id={sid}: {e}")
            skipped_count += 1

    print(f"[DONE] Ukupno: {total} | Spremljeno: {success_count} | Preskočeno: {skipped_count}")

if __name__ == "__main__":
    run_entity_dump()
