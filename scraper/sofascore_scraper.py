import json
import time
from datetime import datetime
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager

options = webdriver.ChromeOptions()
options.binary_location = "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe"
options.add_argument("--headless=new")
options.add_argument("--disable-gpu")
options.add_argument("--no-sandbox")
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
    time.sleep(3)
    return driver.execute_script(script)

def parse_matches(events, live=False):
    parsed = []

    for event in events:
        timestamp = event["startTimestamp"]
        formatted_time = datetime.fromtimestamp(timestamp).strftime("%H:%M")
        formatted_date = datetime.fromtimestamp(timestamp).strftime("%d.%m.%Y")

        status_display = ""
        minute = None
        status_type = event["status"].get("type", "")

        if live:
            minute = event["status"].get("minute")
            if status_type == "inprogress":
                if minute is None:
                    elapsed_seconds = int(time.time()) - timestamp
                    minute = elapsed_seconds // 60
                status_display = f"{minute}'"
            elif status_type == "notstarted":
                status_display = formatted_time
            elif status_type == "finished":
                status_display = "FT"
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
            "minute": minute if status_type == "inprogress" else None,
            "timestamp": event["startTimestamp"],
            "statusType": status_type,
            "homeColor": event["homeTeam"].get("teamColors", {}).get("primary", "#222"),
            "awayColor": event["awayTeam"].get("teamColors", {}).get("primary", "#222"),
        })
    return parsed

try:
    # LIVE utakmice
    live_data = fetch_data("events/live")
    live_matches = parse_matches(live_data.get("events", []), live=True)
    with open("public/liveMatches.json", "w", encoding="utf-8") as f:
        json.dump(live_matches, f, indent=2, ensure_ascii=False)
    print(f"[OK] Live: {len(live_matches)} utakmica")

    # Sve zakazane za danas
    today = datetime.now().strftime("%Y-%m-%d")
    scheduled_data = fetch_data(f"scheduled-events/{today}")
    scheduled_matches = parse_matches(scheduled_data.get("events", []), live=False)
    with open("public/scheduledMatches.json", "w", encoding="utf-8") as f:
        json.dump(scheduled_matches, f, indent=2, ensure_ascii=False)
    print(f"[OK] Zakazane: {len(scheduled_matches)} utakmica")

except Exception as e:
    print("[ERROR] Greska:", e)
finally:
    driver.quit()
