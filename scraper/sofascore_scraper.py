# scraper/sofascore_scraper.py - POBOLJŠANA VERZIJA
import time
import uuid
from datetime import datetime, timezone, timedelta
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from supabase_client import supabase
import os
from tqdm import tqdm

# ---- Selenium setup ----
options = webdriver.ChromeOptions()
options.binary_location = os.getenv("BRAVE_PATH", "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe")
options.add_argument("--headless=new")
options.add_argument("--disable-gpu")
options.add_argument("--no-sandbox")
options.add_argument("--disable-software-rasterizer")
options.add_argument("--disable-logging")
options.add_argument("--disable-dev-shm-usage")

driver = webdriver.Chrome(service=Service("scraper/drivers/chromedriver.exe"), options=options)

# ---- Competition cache ----
competition_cache = {}

def fetch_data(endpoint):
    """Fetch JSON data from SofaScore API"""
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

def get_or_create_competition(tournament_data):
    """Get or create competition, return UUID"""
    tournament_name = tournament_data.get("name", "Unknown")
    tournament_id = tournament_data.get("id")
    country = tournament_data.get("category", {}).get("name", "Unknown")
    logo_url = tournament_data.get("category", {}).get("flag", None)
    priority = tournament_data.get("priority", 0)

    if not tournament_id:
        return None

    # Check cache first
    if tournament_id in competition_cache:
        return competition_cache[tournament_id]

    # Check database
    try:
        existing = supabase.table("competitions").select("id").eq("name", tournament_name).execute()
        if existing.data:
            comp_id = existing.data[0]["id"]
            competition_cache[tournament_id] = comp_id
            return comp_id
    except Exception as e:
        print(f"[WARN] Error checking competition: {e}")

    # Create new competition
    try:
        new_id = str(uuid.uuid4())
        comp_data = {
            "id": new_id,
            "name": tournament_name,
            "country": country,
            "logo_url": logo_url,
            "priority": priority
        }
        supabase.table("competitions").insert(comp_data).execute()
        competition_cache[tournament_id] = new_id
        print(f"[INFO] Created competition: {tournament_name}")
        return new_id
    except Exception as e:
        print(f"[ERROR] Failed to create competition {tournament_name}: {e}")
        return None

def map_status(status_type: str, start_time: datetime, now: datetime) -> str:
    """🔧 POBOLJŠANO: Map SofaScore status to app status with time validation"""
    
    # Osnovni mapping
    mapping = {
        "halftime": "ht",
        "inprogress": "live",
        "finished": "finished",
        "afterextra": "finished",
        "penalties": "finished",
        "notstarted": "upcoming",
        "postponed": "postponed",
        "cancelled": "canceled",
        "abandoned": "abandoned",
        "suspended": "suspended"
    }
    
    mapped_status = mapping.get(status_type, "upcoming")
    
    # 🔧 SIGURNOSNA PROVJERA: Ako je utakmica trebala završiti prije više od 3 sata
    time_since_start = now - start_time
    
    if mapped_status in ["live", "ht"] and time_since_start > timedelta(hours=3):
        print(f"[ZOMBIE DETECTED] Match should be finished - {time_since_start} since start")
        print(f"[ZOMBIE] Forcing {status_type} -> finished for match at {start_time}")
        return "finished"
    
    # 🔧 PROVJERA: Ako je utakmica u budućnosti, ali status kaže da je live
    if start_time > now + timedelta(minutes=15) and mapped_status in ["live", "ht"]:
        print(f"[TIME ERROR] Future match marked as live - forcing to upcoming")
        return "upcoming"
    
    return mapped_status

def calculate_minute(status_type, period_start, period, now, start_time):
    """🔧 FINALNA ISPRAVKA: Calculate current minute realistically"""
    
    # Samo za live utakmice
    if status_type not in ["inprogress", "halftime"]:
        return None
    
    if not start_time:
        return None
        
    # Kalkuliraj minute od početka utakmice
    minutes_from_start = int((now.timestamp() - start_time.timestamp()) // 60)
    print(f"[MINUTE DEBUG] Minutes from match start: {minutes_from_start}'")
    
    # Sigurnosna provjera
    if minutes_from_start < 0:
        return 1
    if minutes_from_start > 150:  # Više od 2.5h - vjerojatno greška
        print(f"[WARN] Suspicious time calculation: {minutes_from_start}' - capping at 90")
        return 90
    
    # REALNA KALKULACIJA na temelju vremena od početka utakmice
    if minutes_from_start <= 45:
        # Prvi poluvrijeme (1-45')
        calculated = max(1, minutes_from_start)
        print(f"[MINUTE] 1st half: {calculated}'")
        return calculated
        
    elif minutes_from_start <= 60:
        # Poluvrijeme pauza (45-60')
        if status_type == "halftime":
            print(f"[MINUTE] Half-time break")
            return 45  # Pokaži 45' tijekom poluvremena
        else:
            # Možda dodatno vrijeme prvog poluvremena
            additional = min(minutes_from_start - 45, 5)  # Maksimalno +5 min
            calculated = 45 + additional
            print(f"[MINUTE] 1st half additional: {calculated}'")
            return calculated
            
    elif minutes_from_start <= 105:
        # Drugi poluvrijeme (60-105' od početka = 46'-90' utakmice)
        second_half_minute = 45 + (minutes_from_start - 60)
        calculated = min(second_half_minute, 90)
        print(f"[MINUTE] 2nd half: {calculated}'")
        return calculated
        
    else:
        # Produžeci ili dodatno vrijeme (105+')
        if minutes_from_start <= 120:
            overtime = 90 + (minutes_from_start - 105)
            calculated = min(overtime, 120)
            print(f"[MINUTE] Extra time: {calculated}'")
            return calculated
        else:
            # Prekasno - vjerojatno treba završiti utakmicu
            print(f"[MINUTE] Match too long ({minutes_from_start}') - should be finished")
            return 90

def finish_missing_live_matches(live_events, scheduled_events):
    """🔧 NOVO: Završi utakmice koje više nisu u live feedu"""
    try:
        now = datetime.now(timezone.utc)
        cutoff_time = now - timedelta(minutes=30)  # Utakmice starije od 30 minuta
        
        # Dohvati sve trenutno live utakmice iz baze
        current_live = supabase.table("matches").select("id", "home_team", "away_team", "start_time", "minute").in_(
            "status", ["live", "ht"]
        ).gt("start_time", cutoff_time.isoformat()).execute()
        
        if not current_live.data:
            print("[ZOMBIE] No live matches in database")
            return
        
        # Stvori set ID-jeva utakmica koje su još uvijek live u SofaScore
        live_ids = set()
        for event in live_events:
            sofascore_id = event.get("id")
            if sofascore_id:
                # Konvertiraj u naš UUID format
                our_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"sofa_{sofascore_id}"))
                live_ids.add(our_id)
        
        # Pronađi utakmice koje su live u bazi, ali NISU u SofaScore live feedu
        matches_to_finish = []
        for match in current_live.data:
            if match["id"] not in live_ids:
                # Provjeri da li je utakmica dovoljno stara da je trebala završiti
                start_time = datetime.fromisoformat(match["start_time"].replace("Z", "+00:00"))
                minutes_since_start = (now - start_time).total_seconds() / 60
                
                # Ako je utakmica starija od 110 minuta (90 + 20 dodano vrijeme), završi ju
                if minutes_since_start > 110:
                    matches_to_finish.append(match)
        
        # Završi utakmice koje više nisu live
        finished_count = 0
        for match in matches_to_finish:
            minutes_since_start = (now - datetime.fromisoformat(match["start_time"].replace("Z", "+00:00"))).total_seconds() / 60
            print(f"[MISSING FROM LIVE] Finishing: {match['home_team']} vs {match['away_team']} (Started {minutes_since_start:.0f}m ago)")
            
            update_data = {
                "id": match["id"],
                "status": "finished",
                "status_type": "finished",
                "minute": None,
                "updated_at": now.isoformat()
            }
            
            supabase.table("matches").upsert(update_data, on_conflict=["id"]).execute()
            finished_count += 1
        
        if finished_count > 0:
            print(f"[ZOMBIE] Auto-finished {finished_count} matches missing from live feed")
        else:
            print("[ZOMBIE] All live matches are still in SofaScore feed")
            
    except Exception as e:
        print(f"[ERROR] Failed to finish missing live matches: {e}")

def parse_matches(events):
    """🔧 POBOLJŠANO: Parse SofaScore events to database format"""
    parsed = []
    now = datetime.now(timezone.utc)
    
    for event in events:
        try:
            timestamp = event.get("startTimestamp")
            if not timestamp:
                continue
                
            start_time = datetime.fromtimestamp(timestamp, tz=timezone.utc)
            status_type = event.get("status", {}).get("type", "")
            
            # 🔧 POBOLJŠANO: Status mapping s vremenskom validacijom
            mapped_status = map_status(status_type, start_time, now)
            
            # Calculate minute
            period_start = event.get("time", {}).get("currentPeriodStartTimestamp")
            period = event.get("time", {}).get("period", 0)
            minute = calculate_minute(status_type, period_start, period, now, start_time)
            
            # 🔧 DODATNA PROVJERA: Resetiraj minutu ako je utakmica završena
            if mapped_status in ["finished", "canceled", "postponed", "abandoned"]:
                minute = None
            
            # Get scores
            home_score = event.get("homeScore", {}).get("current")
            away_score = event.get("awayScore", {}).get("current")
            
            # Get competition
            tournament = event.get("tournament", {})
            competition_id = get_or_create_competition(tournament)
            
            parsed.append({
                "id": event["id"],
                "home_team": event["homeTeam"]["name"],
                "away_team": event["awayTeam"]["name"],
                "home_score": home_score,
                "away_score": away_score,
                "start_time": timestamp,
                "status_type": status_type,
                "mapped_status": mapped_status,  # 🔧 DODANO za debugging
                "competition": tournament.get("name", "Unknown"),
                "competition_id": competition_id,
                "season": tournament.get("season"),
                "round": event.get("roundInfo", {}).get("name"),
                "minute": minute,
                "home_color": event["homeTeam"].get("teamColors", {}).get("primary", "#222"),
                "away_color": event["awayTeam"].get("teamColors", {}).get("primary", "#222"),
                "current_period_start": period_start,
                "venue": event.get("venue", {}).get("name"),
                "source": "sofascore"
            })
            
        except Exception as e:
            print(f"[WARN] Skipped event: {e}")
            
    return parsed


def debug_minute_calculations(parsed_matches):
    """Debug helper za provjeru kalkulacije minuta"""
    print(f"\n[DEBUG] Checking minute calculations for live matches:")
    now = datetime.now(timezone.utc)
    
    live_matches = [m for m in parsed_matches if m["mapped_status"] in ["live", "ht"]]
    
    for match in live_matches[:10]:  # Prvi 10
        start_time = datetime.fromtimestamp(match["start_time"], timezone.utc)
        minutes_from_start = (now - start_time).total_seconds() / 60
        
        print(f"  {match['home_team']} vs {match['away_team']}")
        print(f"    Started: {start_time.strftime('%H:%M')} ({minutes_from_start:.0f}m ago)")
        print(f"    Status: {match['status_type']} -> {match['mapped_status']}")
        print(f"    Calculated minute: {match['minute']}'")
        
        if match["minute"] and match["minute"] > 100:
            print(f"    ⚠️  SUSPICIOUS: Minute {match['minute']}' for {minutes_from_start:.0f}m old match!")
        print()


def store_matches(matches):
    """Store matches to database with retry logic"""
    success_count = 0
    error_count = 0
    
    for match in tqdm(matches, desc="Storing matches"):
        data = {
            "id": str(uuid.uuid5(uuid.NAMESPACE_DNS, f"sofa_{match['id']}")),
            "home_team": match["home_team"],
            "away_team": match["away_team"],
            "home_score": match["home_score"],
            "away_score": match["away_score"],
            "start_time": datetime.fromtimestamp(match["start_time"], timezone.utc).isoformat(),
            "status": match["mapped_status"],  # 🔧 KORISTIMO POBOLJŠANI STATUS
            "status_type": match["status_type"],
            "competition": match["competition"],
            "competition_id": match["competition_id"],
            "season": match.get("season"),
            "round": match.get("round"),
            "venue": match.get("venue"),
            "minute": match["minute"],
            "home_color": match["home_color"],
            "away_color": match["away_color"],
            "current_period_start": match.get("current_period_start"),
            "source": "sofascore",
            "updated_at": datetime.now(timezone.utc).isoformat()  # 🔧 DODANO tracking
        }
        
        # Remove None values
        data = {k: v for k, v in data.items() if v is not None}
        
        # Retry logic
        for attempt in range(3):
            try:
                supabase.table("matches").upsert(data, on_conflict=["id"]).execute()
                success_count += 1
                break
            except Exception as e:
                print(f"[ERROR] Attempt {attempt+1} failed: {e}")
                if attempt < 2:
                    time.sleep(1)
        else:
            error_count += 1
            print(f"[ERROR] Failed to store match: {data['id']}")
    
    print(f"[SUCCESS] Stored: {success_count}")
    print(f"[ERROR] Failed: {error_count}")
    print(f"[TOTAL] Processed: {success_count + error_count}")

def cleanup_zombie_matches():
    """🔧 AGRESIVNIJI: Finish matches stuck in live/ht status"""
    try:
        now = datetime.now(timezone.utc)
        cutoff_time = now - timedelta(hours=3)
        
        # Pronađi sve zombie utakmice
        zombie_matches = supabase.table("matches").select("id", "start_time", "status", "home_team", "away_team").in_(
            "status", ["live", "ht"]
        ).lt("start_time", cutoff_time.isoformat()).execute()
        
        zombie_count = 0
        
        for match in zombie_matches.data:
            print(f"[ZOMBIE] {match['home_team']} vs {match['away_team']} - {match['start_time']}")
            
            update_data = {
                "id": match["id"],
                "status": "finished",
                "status_type": "finished", 
                "minute": None,
                "updated_at": now.isoformat()
            }
            
            supabase.table("matches").upsert(update_data, on_conflict=["id"]).execute()
            zombie_count += 1
        
        if zombie_count > 0:
            print(f"[ZOMBIE] Cleaned {zombie_count} zombie matches")
        else:
            print("[ZOMBIE] No zombie matches found")
            
    except Exception as e:
        print(f"[ERROR] Zombie cleanup failed: {e}")

def force_cleanup_old_live_matches():
    """🔧 NOVO: Force cleanup svih starijih live utakmica"""
    try:
        now = datetime.now(timezone.utc)
        cutoff_time = now - timedelta(hours=2)  # Sve što je starije od 2 sata
        
        print(f"[CLEANUP] Cleaning matches older than {cutoff_time}")
        
        # Update direktno u bazi
        result = supabase.table("matches").update({
            "status": "finished",
            "status_type": "finished",
            "minute": None,
            "updated_at": now.isoformat()
        }).in_("status", ["live", "ht"]).lt("start_time", cutoff_time.isoformat()).execute()
        
        print(f"[CLEANUP] Force finished {len(result.data)} old live matches")
        
    except Exception as e:
        print(f"[ERROR] Force cleanup failed: {e}")

if __name__ == "__main__":
    start_time = time.time()
    
    try:
        print("[INFO] Starting IMPROVED SofaScore scraper...")
        
        # 🔧 PRVO: Očistiti sve zombie utakmice
        print("[INFO] Phase 1: Cleaning zombie matches...")
        force_cleanup_old_live_matches()
        cleanup_zombie_matches()
        
        # Fetch data
        print("[INFO] Phase 2: Fetching fresh data...")
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        
        live_data = fetch_data("events/live")
        scheduled_data = fetch_data(f"scheduled-events/{today}")
        
        live_events = live_data.get("events", [])
        scheduled_events = scheduled_data.get("events", [])
        
        print(f"[INFO] Live: {len(live_events)}, Scheduled: {len(scheduled_events)}")
        
        # 🔧 NOVO: Završi utakmice koje više nisu u live feedu
        print("[INFO] Phase 2.5: Finishing matches missing from live feed...")
        finish_missing_live_matches(live_events, scheduled_events)
        
        # Process
        print("[INFO] Phase 3: Processing and storing...")
        all_events = live_events + scheduled_events
        parsed_matches = parse_matches(all_events)

        # 🔧 DODAJTE OVO:
        debug_minute_calculations(parsed_matches)

        store_matches(parsed_matches)
        
        # Final cleanup
        print("[INFO] Phase 4: Final zombie cleanup...")
        cleanup_zombie_matches()
        
        elapsed = time.time() - start_time
        print(f"[SUCCESS] Completed in {elapsed:.2f}s")
        
    except Exception as e:
        print(f"[CRITICAL] Scraper failed: {e}")
        raise
    finally:
        driver.quit()