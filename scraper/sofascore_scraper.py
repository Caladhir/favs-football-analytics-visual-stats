#scraper/sofascore_scraper.py
import time
import sys
import uuid
from datetime import datetime
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from supabase_client import supabase
from utils import (
    upsert_team,
    upsert_player,
    upsert_lineup,
    upsert_player_stats,
    upsert_formation,
    upsert_manager
)

sys.stdout.reconfigure(encoding='utf-8')

# Setup Selenium
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
    current_timestamp = int(time.time())

    for event in events:
        try:
            timestamp = event["startTimestamp"]
            status_type = event["status"].get("type", "")
            time_info = event.get("time", {})

            raw_minute = None
            if status_type == "inprogress":
                cps = time_info.get("currentPeriodStartTimestamp")
                if cps:
                    raw_minute = (current_timestamp - cps) // 60 + 1
                    raw_minute = min(raw_minute, 90)
                    if raw_minute >= 45 and event.get("lastPeriod") == "period1":
                        raw_minute = 45
                else:
                    raw_minute = event.get("status", {}).get("minute")
                    if isinstance(raw_minute, str) and raw_minute.isdigit():
                        raw_minute = int(raw_minute)
                    elif not isinstance(raw_minute, int):
                        raw_minute = None

            if live:
                if raw_minute is not None:
                    status_display = f"{raw_minute}'"
                elif status_type == "halftime":
                    status_display = "HT"
                elif status_type == "finished":
                    status_display = "FT"
                elif status_type == "penalties":
                    status_display = "PEN"
                else:
                    status_display = "Live"
            else:
                status_display = datetime.fromtimestamp(timestamp).strftime("%H:%M")

            parsed.append({
                "id": event["id"],
                "homeTeam": event["homeTeam"]["name"],
                "awayTeam": event["awayTeam"]["name"],
                "score": f"{event.get('homeScore', {}).get('current', '-')}" +
                         " - " +
                         f"{event.get('awayScore', {}).get('current', '-')}",
                "tournament": event["tournament"]["name"],
                "minute": raw_minute,
                "timestamp": timestamp,
                "status": status_display,
                "statusType": status_type,
                "currentPeriodStartTimestamp": time_info.get("currentPeriodStartTimestamp"),
                "homeColor": event["homeTeam"].get("teamColors", {}).get("primary", "#222"),
                "awayColor": event["awayTeam"].get("teamColors", {}).get("primary", "#222"),
            })
        except Exception as e:
            print(f"[WARN] Parsiranje greška za event: {e}")
    return parsed

def parse_score(score_str):
    if not score_str or " - " not in score_str:
        return None, None
    try:
        return [int(s.strip()) if s.strip().isdigit() else None for s in score_str.split(" - ")]
    except:
        return None, None

def store_detailed_match_data(match, raw_event):
    try:
        # Provjere prije nego što bilo što pokušaš
        if not raw_event:
            print(f"[WARN] Preskačem match {match['id']} - prazni podaci.")
            return

        if "homeTeam" not in raw_event or "awayTeam" not in raw_event:
            print(f"[WARN] Preskačem match {match['id']} - nedostaje homeTeam/awayTeam.")
            return

        if "lineups" not in raw_event and "statistics" not in raw_event:
            print(f"[WARN] Preskačem match {match['id']} - nema lineupova ni statistike.")
            return

        # --- Spremi timove ---
        home_team = raw_event["homeTeam"]
        away_team = raw_event["awayTeam"]
        upsert_team(home_team)
        upsert_team(away_team)

        # --- Spremi managere ako postoje ---
        if "homeManager" in raw_event:
            upsert_manager(raw_event["homeManager"], home_team["id"])
        if "awayManager" in raw_event:
            upsert_manager(raw_event["awayManager"], away_team["id"])

        # --- Spremi lineup i formaciju ---
        if "lineups" in raw_event:
            for side in ["home", "away"]:
                team_data = raw_event["lineups"].get(side)
                if team_data and "players" in team_data:
                    team_id = team_data["team"]["id"]
                    for p in team_data["players"]:
                        player = p.get("player")
                        if not player:
                            continue
                        upsert_player(player, team_id)
                        upsert_lineup(match["id"], team_id, player, p)
                    upsert_formation(match["id"], team_id, team_data.get("formation", "Unknown"))

        # --- Spremi statistiku igrača ---
        if "statistics" in raw_event:
            for team_stats in raw_event["statistics"].get("players", []):
                team_id = team_stats["team"]["id"]
                for pstat in team_stats["players"]:
                    player = pstat.get("player")
                    stats = pstat.get("statistics")
                    if player and stats:
                        upsert_player(player, team_id)
                        upsert_player_stats(match["id"], team_id, player["id"], stats)

        print(f"[OK] Detaljno spremljeno za match {match['id']}")

    except Exception as e:
        print(f"[ERROR] Detaljno spremanje za {match['id']}: {e}")


def store_matches(matches, raw_events):
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
            "current_period_start": match.get("currentPeriodStartTimestamp"),
            "source": "sofascore"
        }

        try:
            supabase.table("matches").upsert(data, on_conflict=["id"]).execute()
            print(f"[OK] Match spreman: {data['id']}")
        except Exception as e:
            print(f"[ERROR] Greška spremanja {data['id']}: {e}")

        raw_event = next((e for e in raw_events if e["id"] == match["id"]), None)
        if raw_event:
            store_detailed_match_data(data, raw_event)

if __name__ == "__main__":
    try:
        print("[INFO] Učitavanje live i današnjih utakmica...")
        live_data = fetch_data("events/live")
        today_str = datetime.now().strftime("%Y-%m-%d")
        today_data = fetch_data(f"scheduled-events/{today_str}")

        live_matches = parse_matches(live_data.get("events", []), live=True)
        today_matches = parse_matches(today_data.get("events", []), live=False)

        all_matches = live_matches + today_matches
        all_events = live_data.get("events", []) + today_data.get("events", [])

        store_matches(all_matches, all_events)
        print("[OK] Sve spremljeno.")
    except Exception as e:
        print(f"[ERROR] Glavna greška: {e}")
    finally:
        driver.quit()
