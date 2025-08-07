import time
import uuid
from datetime import datetime, timezone, timedelta
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
    if status_type == "halftime":
        return "ht"
    elif status_type == "inprogress":
        return "live"
    elif status_type in ["finished", "afterextra", "penalties"]:
        return status_type  
    elif status_type == "notstarted":
        return "upcoming"
    elif status_type in ["postponed", "cancelled", "abandoned"]:
        return status_type.lower()
    return "upcoming"

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

            # Fallback: Ako je event stariji od 3h a još je notstarted ili inprogress -> završen
            if status_type in ["notstarted", "inprogress", ""]:
                if now > start_time + timedelta(hours=3):
                    status_type = "finished"

            period_start = event.get("time", {}).get("currentPeriodStartTimestamp")
            period = event.get("time", {}).get("period", 0)

            minute = None
            if status_type == "inprogress" and period_start:
                raw_minute = int((now.timestamp() - period_start) // 60)
                if period == 2:
                    minute = 45 + raw_minute
                elif period == 3:
                    minute = 90 + raw_minute
                elif period == 4:
                    minute = 105 + raw_minute
                else:
                    minute = raw_minute

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

    print(f"\n[OK] Uspješno spremljeno: {success_count}")
    print(f"[ERROR] Grešaka prilikom spremanja: {error_count}")
    print(" [DONE]Ukupno obrađeno:", success_count + error_count)

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

        # --- UBACUJEMO ZOMBI KILLER LOGIKU ---
        # 1. ID-evi svih trenutno live utakmica (koje je SofaScore prijavio)
        live_event_ids = {str(uuid.uuid5(uuid.NAMESPACE_DNS, f"sofa_{e['id']}")) for e in live_data.get('events', [])}

        # 2. Sve iz baze koje su još uvijek live
        existing_live_matches = supabase.table("matches").select("id", "status", "start_time").eq("status", "live").execute()
        now = datetime.now(timezone.utc)
        for m in existing_live_matches.data:
            if m["id"] not in live_event_ids:
                # Ako nije više među live (znači završila/otkazana/izašla iz feeda)
                # Ako je prošlo više od 3h od start_time, markiraj je finished
                start_time = datetime.fromisoformat(m["start_time"].replace("Z", "+00:00"))
                if now > start_time + timedelta(hours=3):
                    update = {
                        "id": m["id"],
                        "status": "finished",
                        "status_type": "finished",
                        "minute": None
                    }
                    supabase.table("matches").upsert(update, on_conflict=["id"]).execute()
                    print(f"[ZOMBIE] Forced finish for {m['id']} ({start_time})")
    finally:
        driver.quit()
