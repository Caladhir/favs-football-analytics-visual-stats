import requests
import json
from datetime import datetime

def fetch_matches():
    today = datetime.today().strftime('%Y-%m-%d')
    scheduled_url = f"https://www.sofascore.com/api/v1/sport/football/scheduled-events/{today}"
    live_url = "https://www.sofascore.com/api/v1/sport/football/events/live"

    headers = {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json, text/plain, */*",
        "Referer": "https://www.sofascore.com/",
        "Origin": "https://www.sofascore.com"
    }

    all_matches = []

    for url in [scheduled_url, live_url]:
        try:
            response = requests.get(url, headers=headers)
            if response.status_code == 200:
                data = response.json()
                for event in data.get("events", []):
                    all_matches.append({
                        "id": event["id"],
                        "homeTeam": event["homeTeam"]["name"],
                        "awayTeam": event["awayTeam"]["name"],
                        "score": f"{event.get('homeScore', {}).get('current', '-')}" +
                                 " - " +
                                 f"{event.get('awayScore', {}).get('current', '-')}",
                        "status": event["status"].get("description", "unknown"),
                        "tournament": event["tournament"]["name"],
                        "timestamp": event["startTimestamp"]
                    })
            else:
                print(f"⚠️ Greška za URL {url}: {response.status_code}")
        except Exception as e:
            print(f"❌ Greška kod zahtjeva: {e}")

    with open("public/matches.json", "w", encoding="utf-8") as f:
        json.dump(all_matches, f, indent=2, ensure_ascii=False)

    print(f"✓ Spremio {len(all_matches)} utakmica u matches.json")
