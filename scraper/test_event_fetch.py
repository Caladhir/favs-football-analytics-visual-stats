from sofascore_scraper import fetch_data
import sys

def test_event_fetch(event_ids):
    for event_id in event_ids:
        print(f"\n[INFO] Testiram event/{event_id}")
        try:
            data = fetch_data(f"event/{event_id}")
            if not data:
                print("[ERROR] Nema podataka.")
                continue

            print("[OK] Podaci dohvaćeni.")
            print(f"- homeTeam: {'✅' if 'homeTeam' in data else '❌'}")
            print(f"- awayTeam: {'✅' if 'awayTeam' in data else '❌'}")
            print(f"- lineups: {'✅' if 'lineups' in data else '❌'}")
            print(f"- statistics: {'✅' if 'statistics' in data else '❌'}")
            print(f"- tournament: {data.get('tournament', {}).get('name', '❌')}")
            print(f"- status: {data.get('status', {}).get('description', '❌')}")
            print(f"- startTime: {data.get('startTimestamp', '❌')}")

        except Exception as e:
            print(f"[ERROR] Greška dohvaćanja: {e}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("⚠️  Unesi jedan ili više SofaScore event ID-eva kao argumente.")
        print("Primjer: python scraper/test_event_fetch.py 123456 654321")
        sys.exit(1)

    ids = sys.argv[1:]
    test_event_fetch(ids)
