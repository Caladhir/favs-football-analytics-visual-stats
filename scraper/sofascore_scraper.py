import time
import uuid
from datetime import datetime, timezone,timedelta   
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from supabase_client import supabase
from utils import (
    upsert_team,
    upsert_player,
    upsert_lineup,
    upsert_player_stats,
    upsert_formation,
    upsert_manager,
)

# Setup Brave headless browser
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
    time.sleep(2)
    return driver.execute_script(script)


def fetch_event_data(match_id):
    return fetch_data(f"event/{match_id}/json")


def map_status_type(status_type: str) -> str:
    return {
        "inprogress": "live",
        "notstarted": "upcoming",
        "finished": "finished",
        "afterextra": "finished",
        "penalties": "finished",
    }.get(status_type, "upcoming")


def parse_matches(events):
    parsed = []
    for event in events:
        try:
            timestamp = event["startTimestamp"]
            status_type = event["status"].get("type", "")
            minute = event.get("time", {}).get("current") or event.get("status", {}).get("minute")

            parsed.append({
                "id": event["id"],
                "homeTeam": event["homeTeam"]["name"],
                "awayTeam": event["awayTeam"]["name"],
                "homeId": event["homeTeam"]["id"],
                "awayId": event["awayTeam"]["id"],
                "score": f"{event.get('homeScore', {}).get('current', '-')}" +
                         " - " +
                         f"{event.get('awayScore', {}).get('current', '-')}",
                "tournament": event["tournament"]["name"],
                "minute": minute,
                "timestamp": timestamp,
                "status_type": status_type,
                "homeColor": event["homeTeam"].get("teamColors", {}).get("primary", "#222"),
                "awayColor": event["awayTeam"].get("teamColors", {}).get("primary", "#222"),
            })
        except Exception as e:
            print(f"[WARN] Event parse error: {e}")
    return parsed


def parse_score(score_str):
    try:
        home, away = [int(s.strip()) if s.strip().isdigit() else None for s in score_str.split(" - ")]
        return home, away
    except:
        return None, None


def store_detailed_match_data(match_id, raw_event):
    try:
        if not raw_event:
            return

        upsert_team(raw_event["homeTeam"])
        upsert_team(raw_event["awayTeam"])

        if "homeManager" in raw_event:
            upsert_manager(raw_event["homeManager"], raw_event["homeTeam"]["id"])
        if "awayManager" in raw_event:
            upsert_manager(raw_event["awayManager"], raw_event["awayTeam"]["id"])

        if "lineups" in raw_event:
            for side in ["home", "away"]:
                team_data = raw_event["lineups"].get(side)
                if team_data and "players" in team_data:
                    team_id = team_data["team"]["id"]
                    for p in team_data["players"]:
                        player = p.get("player")
                        if player:
                            upsert_player(player, team_id)
                            upsert_lineup(match_id, team_id, player, p)
                    upsert_formation(match_id, team_id, team_data.get("formation", "Unknown"))

        if "statistics" in raw_event:
            for team_stats in raw_event["statistics"].get("players", []):
                team_id = team_stats["team"]["id"]
                for pstat in team_stats["players"]:
                    player = pstat.get("player")
                    stats = pstat.get("statistics")
                    if player and stats:
                        upsert_player(player, team_id)
                        upsert_player_stats(match_id, team_id, player["id"], stats)

        print(f"[OK] Detailed data stored for match {match_id}")
    except Exception as e:
        print(f"[ERROR] Detail storage failed for match {match_id}: {e}")


def store_matches(matches):
    for match in matches:
        event = fetch_event_data(match["id"])
        raw_event = event.get("event", {})

        # Update match fields from detailed event data
        match["status_type"] = raw_event.get("status", {}).get("type", match["status_type"])
        match["minute"] = raw_event.get("time", {}).get("current") or match["minute"]
        match["score"] = f"{raw_event.get('homeScore', {}).get('current', '-')}" + \
                         " - " + \
                         f"{raw_event.get('awayScore', {}).get('current', '-')}"
        home_score, away_score = parse_score(match["score"])
        current_period_start = raw_event.get("time", {}).get("currentPeriodStartTimestamp")

        match_start = datetime.fromtimestamp(match["timestamp"], timezone.utc)
        if map_status_type(match["status_type"]) in ("live", "upcoming"):
            if datetime.now(timezone.utc) > match_start + timedelta(hours=3):
                print(f"[INFO] Match {match['id']} is older than 3h, marking as finished")
                match["status_type"] = "finished"


        data = {
            "id": str(uuid.uuid5(uuid.NAMESPACE_DNS, f"sofa_{match['id']}")),
            "home_team": match["homeTeam"],
            "away_team": match["awayTeam"],
            "home_score": home_score,
            "away_score": away_score,
            "start_time": datetime.fromtimestamp(match["timestamp"], timezone.utc).isoformat().replace("+00:00", "Z"),
            "current_period_start": current_period_start,
            "status": map_status_type(match["status_type"]),
            "status_type": match["status_type"],
            "competition": match["tournament"],
            "minute": match["minute"] if isinstance(match["minute"], int) else None,
            "home_color": match.get("homeColor"),
            "away_color": match.get("awayColor"),
            "source": "sofascore"
        }

        try:
            supabase.table("matches").upsert(data, on_conflict=["id"]).execute()
            print(f"[OK] Upsert match: {data['id']}")
        except Exception as e:
            print(f"[ERROR] Failed to upsert match {data['id']}: {e}")

        store_detailed_match_data(data["id"], raw_event)


if __name__ == "__main__":
    try:
        print("[INFO] Starting live, today, and yesterday matches fetch...")
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")

        live_data = fetch_data("events/live")
        today_data = fetch_data(f"scheduled-events/{today}")
        yesterday_data = fetch_data(f"scheduled-events/{yesterday}")

        live_matches = parse_matches(live_data.get("events", []))
        today_matches = parse_matches(today_data.get("events", []))
        yesterday_matches = parse_matches(yesterday_data.get("events", []))

        all_matches = {
            m["id"]: m
            for m in live_matches + today_matches + yesterday_matches
        }

        store_matches(list(all_matches.values()))
        print("[✅] Done.")
    except Exception as e:
        print(f"[FATAL] Error in main: {e}")
    finally:
        driver.quit()
