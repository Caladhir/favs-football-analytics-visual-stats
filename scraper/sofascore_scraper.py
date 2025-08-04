# scraper/sofascore_scraper.py
import json
import time
from datetime import datetime
from supabase_client import supabase
import uuid
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager

# Selenium opcije (Brave headless)
options = webdriver.ChromeOptions()
options.binary_location = "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe"
options.add_argument("--headless=new")
options.add_argument("--disable-gpu")
options.add_argument("--no-sandbox")
options.add_argument("--disable-dev-shm-usage")

driver = webdriver.Chrome(service=Service("scraper/drivers/chromedriver.exe"), options=options)

# --- SofaScore API dohvat ---
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
    time.sleep(3)
    return driver.execute_script(script)

# --- Parsiranje utakmica ---
def parse_matches(events, live=False):
    parsed = []

    for event in events:
        timestamp = event["startTimestamp"]
        formatted_time = datetime.fromtimestamp(timestamp).strftime("%H:%M")
        formatted_date = datetime.fromtimestamp(timestamp).strftime("%d.%m.%Y")

        status_type = event["status"].get("type", "")
        minute = event.get("time", {}).get("current") or event.get("status", {}).get("minute")



        if live:
            if status_type == "inprogress" and minute is not None:
                status_display = f"{minute}'"
            elif status_type == "halftime":
                status_display = "HT"
            elif status_type == "finished":
                status_display = "FT"
            elif status_type == "penalties":
                status_display = "PEN"
            else:
                status_display = status_type.capitalize()
        else:
            status_display = formatted_time

        parsed.append({
            "id": event["id"],
            "date": formatted_date,
            "time": formatted_time,
            "homeTeam": event["homeTeam"]["name"],
            "awayTeam": event["awayTeam"]["name"],
            "score": f"{event.get('homeScore', {}).get('current', '-')}" +
                     " - " +
                     f"{event.get('awayScore', {}).get('current', '-')}",
            "status": status_display,
            "tournament": event["tournament"]["name"],
            "minute": minute,
            "timestamp": timestamp,
            "statusType": status_type,
            "homeColor": event["homeTeam"].get("teamColors", {}).get("primary", "#222"),
            "awayColor": event["awayTeam"].get("teamColors", {}).get("primary", "#222"),
        })

    return parsed


# --- Parsiranje rezultata u brojke ---
def parse_score(score_str):
    if not score_str or " - " not in score_str:
        return None, None
    try:
        return [int(s.strip()) if s.strip().isdigit() else None for s in score_str.split(" - ")]
    except:
        return None, None

# --- Slanje utakmica u Supabase ---
def store_matches(matches):
    for match in matches:
        home_score, away_score = parse_score(match["score"])

        data = {
            "id": str(uuid.uuid5(uuid.NAMESPACE_DNS, f"sofa_{match['id']}")),
            "home_team": match["homeTeam"],
            "away_team": match["awayTeam"],
            "home_score": home_score,
            "away_score": away_score,
            "start_time": datetime.fromtimestamp(match["timestamp"]).isoformat(),
            "status": "live" if match["statusType"] == "inprogress" else (
                "upcoming" if match["statusType"] == "notstarted" else "finished"
            ),
            "competition": match["tournament"],
            "minute": match.get("minute"),
            "status_type": match["statusType"],
            "home_color": match.get("homeColor"),
            "away_color": match.get("awayColor"),
            "source": "sofascore"
        }

        try:
            supabase.table("matches").upsert(data, on_conflict=["id"]).execute()
            print(f"[OK] Spremio: {data['id']}")
        except Exception as e:
            print(f"[ERROR] Greška pri spremanju {data['id']}: {e}")

# --- Glavni scraper flow ---
try:
    # 1. Live utakmice
    live_data = fetch_data("events/live")
    print(json.dumps(live_data, indent=2, ensure_ascii=False).encode('utf-8').decode('utf-8'))

    live_matches = parse_matches(live_data.get("events", []), live=True)
    with open("public/liveMatches.json", "w", encoding="utf-8") as f:
        json.dump(live_matches, f, indent=2, ensure_ascii=False)
    print(f"[OK] Live: {len(live_matches)} utakmica")

    # 2. Zakazane utakmice za danas
    today = datetime.now().strftime("%Y-%m-%d")
    scheduled_data = fetch_data(f"scheduled-events/{today}")
    scheduled_matches = parse_matches(scheduled_data.get("events", []), live=False)
    with open("public/scheduledMatches.json", "w", encoding="utf-8") as f:
        json.dump(scheduled_matches, f, indent=2, ensure_ascii=False)
    print(f"[OK] Zakazane: {len(scheduled_matches)} utakmica")

    # 3. Spremi u Supabase
    store_matches(live_matches + scheduled_matches)
    print("[OK] Svi podaci poslani u Supabase.")

except Exception as e:
    print("[ERROR] Greška:", e)

finally:
    driver.quit()
