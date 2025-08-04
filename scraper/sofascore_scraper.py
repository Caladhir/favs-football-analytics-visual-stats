import time
from datetime import datetime
import uuid
import sys

from supabase_client import supabase
from selenium import webdriver
from selenium.webdriver.chrome.service import Service

sys.stdout.reconfigure(encoding='utf-8')

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
    current_timestamp = int(time.time())

    for event in events:
        try:
            timestamp = event["startTimestamp"]
            formatted_time = datetime.fromtimestamp(timestamp).strftime("%H:%M")
            formatted_date = datetime.fromtimestamp(timestamp).strftime("%d.%m.%Y")
            status_type = event["status"].get("type", "")
            time_info = event.get("time", {})

            raw_minute = None
            if status_type == "inprogress":
                cps = time_info.get("currentPeriodStartTimestamp")
                if cps:
                    raw_minute = (current_timestamp - cps) // 60 + 1
                    if raw_minute >= 90:
                        raw_minute = 90
                    elif raw_minute >= 45 and event.get("lastPeriod") == "period1":
                        raw_minute = 45
                else:
                    raw_minute = event.get("status", {}).get("minute")
                    if isinstance(raw_minute, str) and raw_minute.isdigit():
                        raw_minute = int(raw_minute)
                    elif not isinstance(raw_minute, int):
                        raw_minute = None

            # Prikaz statusa
            if live:
                if raw_minute is not None:
                    status_display = f"{raw_minute}'"
                elif status_type == "inprogress":
                    status_display = "Live"
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
                "minute": raw_minute,
                "timestamp": timestamp,
                "currentPeriodStartTimestamp": event.get("time", {}).get("currentPeriodStartTimestamp"),
                "statusType": status_type,
                "homeColor": event["homeTeam"].get("teamColors", {}).get("primary", "#222"),
                "awayColor": event["awayTeam"].get("teamColors", {}).get("primary", "#222"),
            })
        except Exception as e:
            print(f"[WARN] Parsiranje greška za event: {e}")

    return parsed

# --- Parsiranje rezultata ---
def parse_score(score_str):
    if not score_str or " - " not in score_str:
        return None, None
    try:
        return [int(s.strip()) if s.strip().isdigit() else None for s in score_str.split(" - ")]
    except:
        return None, None

# --- Slanje u Supabase ---
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
            "minute": match["minute"] if isinstance(match["minute"], int) else None,
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
if __name__ == "__main__":
    try:
        # Live utakmice
        live_data = fetch_data("events/live")
        live_matches = parse_matches(live_data.get("events", []), live=True)

        # Današnje zakazane utakmice
        today = datetime.now().strftime("%Y-%m-%d")
        scheduled_data = fetch_data(f"scheduled-events/{today}")
        scheduled_matches = parse_matches(scheduled_data.get("events", []), live=False)

        # Spremi
        store_matches(live_matches + scheduled_matches)
        print("[OK] Svi podaci poslani u Supabase.")

    except Exception as e:
        print(f"[ERROR] Glavna greška: {e}")

    finally:
        driver.quit()
