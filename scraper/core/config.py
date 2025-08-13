# scraper/core/config.py 
import os
from pathlib import Path
from dotenv import load_dotenv
import sys

# Encoding setup
sys.stdout.reconfigure(encoding='utf-8')

# Load environment variables
BASE_DIR = Path(__file__).resolve().parent.parent.parent
load_dotenv(dotenv_path=BASE_DIR / ".env.local")

class Config:
    """Centralizirane konfiguracije za scraper"""
    
    # 🔧 DATABASE SETTINGS
    SUPABASE_URL = os.getenv("SUPABASE_URL")
    SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
    
    # 🔧 BROWSER SETTINGS
    BRAVE_PATH = os.getenv("BRAVE_PATH", "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe")
    CHROMEDRIVER_PATH = "scraper/drivers/chromedriver.exe"
    
    # 🔧 SCRAPING INTERVALS
    SCRAPER_INTERVAL = 10 
    RETRY_ATTEMPTS = 3
    BATCH_SIZE = 50
    
    # 🔧 TIMEOUTS
    PAGE_LOAD_TIMEOUT = 30   
    IMPLICIT_WAIT = 10
    REQUEST_TIMEOUT = 30
    
    # 🔧 DATA VALIDATION
    ZOMBIE_HOUR_LIMIT = 3  # Hours after which live match is considered zombie
    RELAXED_HOUR_LIMIT = 10  # Hours for relaxed filter
    FUTURE_TOLERANCE_MINUTES = 15  # Minutes tolerance for future matches
    
    CACHE_DURATION = 5 * 60 * 1000  # 5 minutes in milliseconds
    MAX_CONNECTIONS = 20
    KEEPALIVE_CONNECTIONS = 10
    
    # 🔧 LIGA PRIORITETI (synced with frontend)
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
    
    # 🔧 BROWSER OPTIONS
    CHROME_OPTIONS = [
        "--headless=new",
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-software-rasterizer",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
        "--disable-features=TranslateUI",
        "--disable-ipc-flooding-protection",
        "--disable-accelerated-2d-canvas",
        "--disable-accelerated-jpeg-decoding",
        "--disable-accelerated-mjpeg-decode",
        "--disable-accelerated-video-decode",
        "--disable-accelerated-video-encode",
        "--disable-gl-extensions",
        "--disable-logging",
        "--disable-extensions",
        "--disable-plugins",
        "--disable-web-security",
        "--allow-running-insecure-content",
        "--ignore-certificate-errors",
        "--ignore-ssl-errors",
        "--ignore-certificate-errors-spki-list",
        "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "--max_old_space_size=4096",
        "--memory-pressure-off",
        "--max-unused-resource-memory-usage-percentage=5",
        "--aggressive-cache-discard",
        "--aggressive",
        "--disable-background-networking",
        "--disable-default-apps",
        "--disable-sync"
    ]
    
    # 🔧 BROWSER PREFERENCES
    CHROME_PREFS = {
        "profile.default_content_setting_values": {
            "images": 2,  # Block images za brzinu
            "plugins": 2,
            "popups": 2,
            "geolocation": 2,
            "notifications": 2,
            "media_stream": 2,
        },
        "profile.managed_default_content_settings": {
            "images": 2
        }
    }
    
    # 🔧 STATUS MAPPING
    STATUS_MAPPING = {
    # Live statuses
    'inprogress': 'live',
    'live': 'live',
    
    # Half-time 
    'halftime': 'ht',
    'ht': 'ht',
    
    # Finished
    'finished': 'finished',
    'ended': 'finished',
    'ft': 'ft',  # Full time finished
    'fulltime': 'ft',
    
    # Upcoming/Scheduled
    'notstarted': 'upcoming',
    'upcoming': 'upcoming',
    'scheduled': 'upcoming',
    
    # Cancelled/Postponed
    'cancelled': 'canceled',
    'canceled': 'canceled',
    'postponed': 'postponed',
    'delayed': 'postponed',
    
    # Abandoned/Suspended
    'abandoned': 'abandoned',
    'suspended': 'suspended',  # ✅ ADDED: This was missing!
    
    # Default fallback
    'unknown': 'upcoming'
}
    
    # 🔧 LOGGING CONFIGURATION
    LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
    LOG_FORMAT = "[%(asctime)s] %(levelname)s [%(name)s] %(message)s"
    LOG_DATE_FORMAT = "%H:%M:%S"
    
    @classmethod
    def validate_config(cls):
        """Validira osnovne konfiguracije"""
        errors = []
        
        if not cls.SUPABASE_URL:
            errors.append("SUPABASE_URL not set")
        
        if not cls.SUPABASE_SERVICE_KEY:
            errors.append("SUPABASE_SERVICE_KEY not set")
            
        if not Path(cls.CHROMEDRIVER_PATH).exists():
            errors.append(f"ChromeDriver not found at {cls.CHROMEDRIVER_PATH}")
            
        if not Path(cls.BRAVE_PATH).exists():
            errors.append(f"Brave browser not found at {cls.BRAVE_PATH}")
        
        if errors:
            raise ValueError(f"Configuration errors: {', '.join(errors)}")
        
        return True
    
    @classmethod
    def get_league_priority(cls, competition_name):
        """Dobiva prioritet lige s fuzzy matching"""
        if not competition_name:
            return 10  # default priority
        
        normalized_name = competition_name.lower().strip()
        
        # Exact match
        for league, priority in cls.LEAGUE_PRIORITIES.items():
            if normalized_name == league.lower():
                return priority
        
        # Fuzzy matching
        for league, priority in cls.LEAGUE_PRIORITIES.items():
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

# Validate configuration on import
Config.validate_config()

# Export main config instance
config = Config()