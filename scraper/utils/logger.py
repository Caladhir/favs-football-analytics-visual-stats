# scraper/utils/logger.py - ISPRAVLJENA VERZIJA
import logging
import sys
from pathlib import Path
from datetime import datetime

# 🔧 ISPRAVKA: Dodaj fallback za config import
try:
    from core.config import config
    LOG_LEVEL = config.LOG_LEVEL
    LOG_FORMAT = config.LOG_FORMAT
    LOG_DATE_FORMAT = config.LOG_DATE_FORMAT
except ImportError:
    # Fallback ako config nije dostupan
    LOG_LEVEL = "INFO"
    LOG_FORMAT = "[%(asctime)s] %(levelname)s [%(name)s] %(message)s"
    LOG_DATE_FORMAT = "%H:%M:%S"

# Setup osnovnog formatiranja
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL.upper()),
    format=LOG_FORMAT,
    datefmt=LOG_DATE_FORMAT,
    stream=sys.stdout
)

def get_logger(name: str) -> logging.Logger:
    """Dohvati logger za modul"""
    return logging.getLogger(name)

class ScraperLogger:
    """Centralizirani logger za scraper s file output"""
    
    def __init__(self, log_dir: str = "logs"):
        self.log_dir = Path(log_dir)
        self.log_dir.mkdir(exist_ok=True)
        
        # Setup file handler
        log_file = self.log_dir / f"scraper_{datetime.now().strftime('%Y%m%d')}.log"
        
        file_handler = logging.FileHandler(log_file, encoding='utf-8')
        file_handler.setLevel(logging.INFO)
        file_formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
        file_handler.setFormatter(file_formatter)
        
        # Add file handler to root logger
        root_logger = logging.getLogger()
        root_logger.addHandler(file_handler)
    
    def log_scraper_start(self):
        """Log početak scraper sessiona"""
        logger = get_logger("scraper.main")
        logger.info("=" * 50)
        logger.info("🚀 SCRAPER SESSION STARTED")
        logger.info(f"Time: {datetime.now().isoformat()}")
        logger.info("=" * 50)
    
    def log_scraper_end(self, success: bool, duration: float, stats: dict = None):
        """Log završetak scraper sessiona"""
        logger = get_logger("scraper.main")
        logger.info("=" * 50)
        
        if success:
            logger.info("✅ SCRAPER SESSION COMPLETED")
        else:
            logger.info("❌ SCRAPER SESSION FAILED")
        
        logger.info(f"Duration: {duration:.2f}s")
        
        if stats:
            logger.info(f"Stats: {stats}")
        
        logger.info("=" * 50)