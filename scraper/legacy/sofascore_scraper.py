# scraper/sofascore_scraper.py - S POBOLJŠANIM PRIORITETIMA LIGA
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

# 🚀 NOVO: Liga prioriteti za sortiranje (sinhronizirano s frontend-om)
LEAGUE_PRIORITIES = {
    # UEFA natjecanja - najviši prioritet
    'UEFA Champions League': 120,
    'Champions League': 120,
    'UEFA Europa League': 110,
    'Europa League': 110,
    'UEFA Conference League': 100,
    'Conference League': 100,
    'UEFA Nations League': 95,
    'Nations League': 95,
    
    # Top 5 europskih liga
    'Premier League': 90,
    'English Premier League': 90,
    'EPL': 90,
    'La Liga': 85,
    'LaLiga': 85,
    'Serie A': 80,
    'Bundesliga': 75,
    'Ligue 1': 70,
    
    # Ostala važna natjecanja
    'FIFA World Cup': 130,
    'World Cup': 130,
    'UEFA European Championship': 125,
    'European Championship': 125,
    'Euro 2024': 125,
    'Copa America': 85,
    'Africa Cup of Nations': 60,
    
    # Regionalne europske lige
    'Eredivisie': 55,
    'Primeira Liga': 50,
    'Belgian Pro League': 45,
    'Jupiler Pro League': 45,
    'Scottish Premiership': 40,
    'Austrian Bundesliga': 35,
    'Swiss Super League': 32,
    'Danish Superliga': 30,
    'Norwegian Eliteserien': 28,
    'Swedish Allsvenskan': 26,
    
    # Balkanske lige
    'HNL': 25,  # Hrvatska
    'Prva Liga Srbije': 22,
    'SuperLiga': 22,
    'Prva Liga BiH': 20,
    'Liga 1': 18,  # Rumunjska
    'Bulgarian First League': 16,
    
    # Ostale intercontinentalne lige
    'MLS': 25,
    'Major League Soccer': 25,
    'J1 League': 24,
    'K League 1': 22,
    'A-League': 20,
    'Brasileirão': 65,
    'Serie A Brazil': 65,
    'Argentine Primera División': 45,
    
    # Kup natjecanja (niži prioritet od liga)
    'FA Cup': 35,
    'Copa del Rey': 40,
    'Coppa Italia': 38,
    'DFB-Pokal': 36,
    'Coupe de France': 34,
}

def get_league_priority(competition_name):
    """🚀 NOVO: Dobiva prioritet lige (fuzzy matching)"""
    if not competition_name:
        return 10  # default priority
    
    normalized_name = competition_name.lower().strip()
    
    # Exact match
    for league, priority in LEAGUE_PRIORITIES.items():
        if normalized_name == league.lower():
            return priority
    
    # Fuzzy matching
    for league, priority in LEAGUE_PRIORITIES.items():
        if league.lower() in normalized_name:
            return priority
    
    # Posebni slučajevi
    if 'champions' in normalized_name:
        return 120
    if 'europa' in normalized_name:
        return 110
    if 'premier' in normalized_name:
        return 90
    if 'bundesliga' in normalized_name:
        return 75
    if 'serie a' in normalized_name:
        return 80
    
    return 10  # default

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
    """🚀 POBOLJŠANO: Get or create competition with priority"""
    tournament_name = tournament_data.get("name", "Unknown")
    tournament_id = tournament_data.get("id")
    country = tournament_data.get("category", {}).get("name", "Unknown")
    logo_url = tournament_data.get("category", {}).get("flag", None)
    
    # 🚀 NOVO: Kalkuliraj prioritet na temelju naziva
    calculated_priority = get_league_priority(tournament_name)
    sofascore_priority = tournament_data.get("priority", 0)
    
    # Koristi veći prioritet
    final_priority = max(calculated_priority, sofascore_priority)

    if not tournament_id:
        return None

    # Check cache first
    if tournament_id in competition_cache:
        return competition_cache[tournament_id]

    # Check database
    try:
        existing = supabase.table("competitions").select("id", "priority").eq("name", tournament_name).execute()
        if existing.data:
            comp_id = existing.data[0]["id"]
            existing_priority = existing.data[0].get("priority", 0)
            
            # 🚀 NOVO: Ažuriraj prioritet ako je naš bolji
            if final_priority > existing_priority:
                supabase.table("competitions").update({
                    "priority": final_priority
                }).eq("id", comp_id).execute()
                print(f"[PRIORITY] Updated {tournament_name}: {existing_priority} -> {final_priority}")
            
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
            "priority": final_priority  # 🚀 KORISTI KALKULIRANI PRIORITET
        }
        supabase.table("competitions").insert(comp_data).execute()
        competition_cache[tournament_id] = new_id
        print(f"[INFO] Created competition: {tournament_name} (priority: {final_priority})")
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
        return calculated
        
    elif minutes_from_start <= 60:
        # Poluvrijeme pauza (45-60')
        if status_type == "halftime":
            return 45  # Pokaži 45' tijekom poluvremena
        else:
            # Možda dodatno vrijeme prvog poluvremena
            additional = min(minutes_from_start - 45, 5)  # Maksimalno +5 min
            calculated = 45 + additional
            return calculated
            
    elif minutes_from_start <= 105:
        # Drugi poluvrijeme (60-105' od početka = 46'-90' utakmice)
        second_half_minute = 45 + (minutes_from_start - 60)
        calculated = min(second_half_minute, 90)
        return calculated
        
    else:
        # Produžeci ili dodatno vrijeme (105+')
        if minutes_from_start <= 120:
            overtime = 90 + (minutes_from_start - 105)
            calculated = min(overtime, 120)
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
    
    # 🚀 NOVO: Statistike za monitoring
    league_stats = {}
    
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
            
            # Get competition with priority
            tournament = event.get("tournament", {})
            competition_id = get_or_create_competition(tournament)
            competition_name = tournament.get("name", "Unknown")
            
            # 🚀 NOVO: Prikupi statistike po ligama
            if competition_name not in league_stats:
                league_stats[competition_name] = {
                    'total': 0,
                    'live': 0,
                    'priority': get_league_priority(competition_name)
                }
            league_stats[competition_name]['total'] += 1
            if mapped_status in ['live', 'ht']:
                league_stats[competition_name]['live'] += 1
            
            parsed.append({
                "id": event["id"],
                "home_team": event["homeTeam"]["name"],
                "away_team": event["awayTeam"]["name"],
                "home_score": home_score,
                "away_score": away_score,
                "start_time": timestamp,
                "status_type": status_type,
                "mapped_status": mapped_status,  # 🔧 DODANO za debugging
                "competition": competition_name,
                "competition_id": competition_id,
                "season": tournament.get("season"),
                "round": event.get("roundInfo", {}).get("name"),
                "minute": minute,
                "home_color": event["homeTeam"].get("teamColors", {}).get("primary", "#222"),
                "away_color": event["awayTeam"].get("teamColors", {}).get("primary", "#222"),
                "current_period_start": period_start,
                "venue": event.get("venue", {}).get("name"),
                "source": "sofascore",
                "league_priority": get_league_priority(competition_name)  # 🚀 NOVO
            })
            
        except Exception as e:
            print(f"[WARN] Skipped event: {e}")
    
    # 🚀 NOVO: Prikaži statistike po ligama
    print(f"\n[LEAGUE STATS] Processed {len(parsed)} matches across {len(league_stats)} competitions:")
    
    # Sortiraj lige po prioritetu za prikaz
    sorted_leagues = sorted(league_stats.items(), key=lambda x: x[1]['priority'], reverse=True)
    
    for league, stats in sorted_leagues[:15]:  # Top 15 liga
        live_indicator = f"🔴 {stats['live']} live" if stats['live'] > 0 else ""
        priority_indicator = "⭐" if stats['priority'] > 80 else ""
        print(f"  {priority_indicator} {league} (P:{stats['priority']}): {stats['total']} matches {live_indicator}")
    
    if len(sorted_leagues) > 15:
        print(f"  ... and {len(sorted_leagues) - 15} more leagues")
            
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
        print(f"    League: {match['competition']} (P:{match['league_priority']})")
        print(f"    Started: {start_time.strftime('%H:%M')} ({minutes_from_start:.0f}m ago)")
        print(f"    Status: {match['status_type']} -> {match['mapped_status']}")
        print(f"    Calculated minute: {match['minute']}'")
        
        if match["minute"] and match["minute"] > 100:
            print(f"    ⚠️  SUSPICIOUS: Minute {match['minute']}' for {minutes_from_start:.0f}m old match!")
        print()


def store_matches(matches):
    """🚀 POBOLJŠANO: Store matches with priority and better error handling"""
    success_count = 0
    error_count = 0
    league_counts = {}
    
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
            "updated_at": datetime.now(timezone.utc).isoformat(),  # 🔧 DODANO tracking
            "league_priority": match["league_priority"]  # 🚀 NOVO za backend sortiranje
        }
        
        # Remove None values
        data = {k: v for k, v in data.items() if v is not None}
        
        # 🚀 NOVO: Track liga statistike
        league = match["competition"]
        if league not in league_counts:
            league_counts[league] = {"stored": 0, "failed": 0}
        
        # Retry logic
        for attempt in range(3):
            try:
                supabase.table("matches").upsert(data, on_conflict=["id"]).execute()
                success_count += 1
                league_counts[league]["stored"] += 1
                break
            except Exception as e:
                print(f"[ERROR] Attempt {attempt+1} failed: {e}")
                if attempt < 2:
                    time.sleep(1)
        else:
            error_count += 1
            league_counts[league]["failed"] += 1
            print(f"[ERROR] Failed to store match: {data['id']}")
    
    print(f"\n[STORAGE] Results:")
    print(f"  ✅ Stored: {success_count}")
    print(f"  ❌ Failed: {error_count}")
    print(f"  📊 Total: {success_count + error_count}")
    
    # 🚀 NOVO: Prikaži top lige po broju pohranjenih utakmica
    top_leagues = sorted(league_counts.items(), 
                        key=lambda x: x[1]["stored"], reverse=True)[:10]
    
    print(f"\n[TOP LEAGUES] Most matches stored:")
    for league, counts in top_leagues:
        priority = get_league_priority(league)
        priority_star = "⭐" if priority > 80 else ""
        print(f"  {priority_star} {league}: {counts['stored']} stored, {counts['failed']} failed")

def cleanup_zombie_matches():
    """🔧 AGRESIVNIJI: Finish matches stuck in live/ht status"""
    try:
        now = datetime.now(timezone.utc)
        cutoff_time = now - timedelta(hours=3)
        
        # Pronađi sve zombie utakmice
        zombie_matches = supabase.table("matches").select("id", "start_time", "status", "home_team", "away_team", "competition").in_(
            "status", ["live", "ht"]
        ).lt("start_time", cutoff_time.isoformat()).execute()
        
        zombie_count = 0
        zombie_leagues = {}
        
        for match in zombie_matches.data:
            league = match.get('competition', 'Unknown')
            if league not in zombie_leagues:
                zombie_leagues[league] = 0
            zombie_leagues[league] += 1
            
            print(f"[ZOMBIE] {match['home_team']} vs {match['away_team']} - {match['start_time']} ({league})")
            
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
            print(f"[ZOMBIE] Cleaned {zombie_count} zombie matches across {len(zombie_leagues)} leagues")
            for league, count in sorted(zombie_leagues.items(), key=lambda x: x[1], reverse=True):
                print(f"  - {league}: {count} zombies")
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

def update_competition_priorities():
    """🚀 NOVO: Batch update competition priorities in database"""
    try:
        print("[PRIORITY] Updating competition priorities...")
        
        # Dohvati sve postojeće natjecanja
        competitions = supabase.table("competitions").select("id", "name", "priority").execute()
        
        updated_count = 0
        for comp in competitions.data:
            current_priority = comp.get("priority", 0)
            calculated_priority = get_league_priority(comp["name"])
            
            # Ažuriraj ako je naš prioritet bolji
            if calculated_priority > current_priority:
                supabase.table("competitions").update({
                    "priority": calculated_priority
                }).eq("id", comp["id"]).execute()
                
                print(f"[PRIORITY] {comp['name']}: {current_priority} -> {calculated_priority}")
                updated_count += 1
        
        print(f"[PRIORITY] Updated {updated_count} competition priorities")
        
    except Exception as e:
        print(f"[ERROR] Failed to update priorities: {e}")

if __name__ == "__main__":
    start_time = time.time()
    
    try:
        print("[INFO] Starting IMPROVED SofaScore scraper with smart league priorities...")
        
        # 🚀 NOVO: Ažuriraj prioritete natjecanja
        print("[INFO] Phase 0: Updating competition priorities...")
        update_competition_priorities()
        
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
        print("[INFO] Phase 3: Processing and storing with priorities...")
        all_events = live_events + scheduled_events
        parsed_matches = parse_matches(all_events)

        # 🔧 Debug minute calculations
        debug_minute_calculations(parsed_matches)

        # 🚀 Store with enhanced tracking
        store_matches(parsed_matches)
        
        # Final cleanup
        print("[INFO] Phase 4: Final zombie cleanup...")
        cleanup_zombie_matches()
        
        elapsed = time.time() - start_time
        print(f"\n[SUCCESS] 🚀 Scraper completed in {elapsed:.2f}s with smart league prioritization!")
        
        # 🚀 NOVO: Finalni izvještaj
        print(f"[SUMMARY] Processed {len(parsed_matches)} matches from SofaScore")
        print(f"[SUMMARY] Live matches: {len([m for m in parsed_matches if m['mapped_status'] in ['live', 'ht']])}")
        print(f"[SUMMARY] Top league matches: {len([m for m in parsed_matches if m['league_priority'] > 80])}")
        
    except Exception as e:
        print(f"[CRITICAL] Scraper failed: {e}")
        raise
    finally:
        driver.quit()