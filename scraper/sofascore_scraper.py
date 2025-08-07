# scraper/sofascore_scraper.py
import time
import uuid
from datetime import datetime, timezone,timedelta
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from supabase_client import supabase
import os
from tqdm import tqdm



options = webdriver.ChromeOptions()
options.binary_location = os.getenv("BRAVE_PATH", "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe")
options.add_argument("--headless=new")
options.add_argument("--disable-gpu")
options.add_argument("--no-sandbox")
options.add_argument("--disable-software-rasterizer")
options.add_argument("--disable-logging")
options.add_argument("--disable-dev-shm-usage")


driver = webdriver.Chrome(service=Service("scraper/drivers/chromedriver.exe"), options=options)

def fetch_data(endpoint):
    script = f"""
        return fetch("https://www.sofascore.com/api/v1/sport/football/{endpoint}", {{
            headers: {{
                "Accept": "application/json, text/plain, */*",
                "Referer": "https://www.sofascore.com/"
            }}
        }}).then(res => res.json());
    """
    driver.get("https://www.sofascore.com/")
    time.sleep(2)
    return driver.execute_script(script)

def parse_score(score):
    try:
        home, away = [int(s.strip()) if s.strip().isdigit() else None for s in score.split(" - ")]
        return home, away
    except:
        return None, None

def map_status(status_type: str) -> str:
    return {
        "inprogress": "live",
        "notstarted": "upcoming",
        "finished": "finished",
        "afterextra": "finished",
        "penalties": "finished",
    }.get(status_type, "upcoming")



def parse_matches(events):
    parsed = []
    now = datetime.now(timezone.utc)

    for event in events:
        try:
            timestamp = event.get("startTimestamp")
            if not timestamp:
                continue

            start_time = datetime.fromtimestamp(timestamp, tz=timezone.utc)
            status_type = event.get("status", {}).get("type", "")
            minute = event.get("time", {}).get("current") or event.get("status", {}).get("minute")

            if not status_type or status_type == "notstarted":
                if now > start_time + timedelta(hours=3):
                    status_type = "finished"

            home_score = event.get("homeScore", {}).get("current", "-")
            away_score = event.get("awayScore", {}).get("current", "-")

            parsed.append({
                "id": event["id"],
                "homeTeam": event["homeTeam"]["name"],
                "awayTeam": event["awayTeam"]["name"],
                "homeId": event["homeTeam"]["id"],
                "awayId": event["awayTeam"]["id"],
                "score": f"{home_score} - {away_score}",
                "tournament": event.get("tournament", {}).get("name", "Unknown"),
                "minute": minute,
                "timestamp": timestamp,
                "status_type": status_type,
                "homeColor": event["homeTeam"].get("teamColors", {}).get("primary", "#222"),
                "awayColor": event["awayTeam"].get("teamColors", {}).get("primary", "#222"),
            })
        except Exception as e:
            print(f"[WARN] Skipped event: {e}")
    return parsed


def store_matches(matches):
    success_count = 0
    error_count = 0

    for match in tqdm(matches, desc="Upserting matches", unit="match"):
        home_score, away_score = parse_score(match["score"])

        data = {
            "id": str(uuid.uuid5(uuid.NAMESPACE_DNS, f"sofa_{match['id']}")),
            "home_team": match["homeTeam"],
            "away_team": match["awayTeam"],
            "home_score": home_score,
            "away_score": away_score,
            "start_time": datetime.fromtimestamp(match["timestamp"], timezone.utc).isoformat().replace("+00:00", "Z"),
            "status": map_status(match["status_type"]),
            "status_type": match["status_type"],
            "competition": match["tournament"],
            "minute": match["minute"] if isinstance(match["minute"], int) else None,
            "home_color": match.get("homeColor", "#222"),
            "away_color": match.get("awayColor", "#222"),
            "source": "sofascore"
        }

        try:
            supabase.table("matches").upsert(data, on_conflict=["id"]).execute()
            success_count += 1
        except Exception as e:
            error_count += 1
            print(f"[ERROR] Failed upsert: {e}")

    print(f"\n✅ Uspješno spremljeno: {success_count}")
    print(f"❌ Grešaka prilikom spremanja: {error_count}")
    print("📦 Ukupno obrađeno:", success_count + error_count)


if __name__ == "__main__":
    try:
        print("[INFO] Fetching matches...")
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        live_data = fetch_data("events/live")
        scheduled_data = fetch_data(f"scheduled-events/{today}")
        print(f"[DEBUG] Found {len(live_data.get('events', []))} live matches.")
        print(f"[DEBUG] Found {len(scheduled_data.get('events', []))} scheduled matches.")

        

        all_events = live_data.get("events", []) + scheduled_data.get("events", [])
        parsed = parse_matches(all_events)
        store_matches(parsed)
        print("[INFO] Done.")
    finally:
        driver.quit()
