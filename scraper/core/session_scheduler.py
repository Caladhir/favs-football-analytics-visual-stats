# scraper/core/session_scheduler.py
import time
import threading
from datetime import datetime, timedelta
from typing import Callable, Optional
from utils.logger import get_logger

logger = get_logger(__name__)

class SessionScheduler:
    """Scheduler za upravljanje dugotrajinim scraper sesijama"""
    
    def __init__(self, browser_manager, config: dict = None):
        self.browser_manager = browser_manager
        self.config = config or {}
        
        # Konfiguracija
        self.health_check_interval = self.config.get('health_check_interval', 300)  # 5 min
        self.forced_refresh_interval = self.config.get('forced_refresh_interval', 3600)  # 1 sat
        self.max_consecutive_failures = self.config.get('max_consecutive_failures', 3)
        self.failure_cooldown = self.config.get('failure_cooldown', 60)  # 1 min
        
        # State tracking
        self.is_running = False
        self.health_thread = None
        self.consecutive_failures = 0
        self.last_health_check = None
        self.last_forced_refresh = datetime.now()
        
        # Callbacks
        self.on_health_failure: Optional[Callable] = None
        self.on_session_refresh: Optional[Callable] = None
    
    def start(self):
        """Pokreni scheduler"""
        if self.is_running:
            logger.warning("Scheduler already running")
            return
        
        self.is_running = True
        self.health_thread = threading.Thread(target=self._health_monitor, daemon=True)
        self.health_thread.start()
        
        logger.info(f"✅ Session scheduler started (health check every {self.health_check_interval}s)")
    
    def stop(self):
        """Zaustavi scheduler"""
        self.is_running = False
        if self.health_thread:
            self.health_thread.join(timeout=5)
        
        logger.info("⏹️ Session scheduler stopped")
    
    def _health_monitor(self):
        """Background thread za health monitoring"""
        while self.is_running:
            try:
                self._perform_health_check()
                self._check_forced_refresh()
                time.sleep(self.health_check_interval)
                
            except Exception as e:
                logger.error(f"Health monitor error: {e}")
                time.sleep(30)  # Kraći sleep na grešku
    
    def _perform_health_check(self):
        """Izvedi health check"""
        try:
            is_healthy = self.browser_manager.health_check()
            self.last_health_check = datetime.now()
            
            if is_healthy:
                if self.consecutive_failures > 0:
                    logger.info(f"✅ Health recovered after {self.consecutive_failures} failures")
                    self.consecutive_failures = 0
            else:
                self.consecutive_failures += 1
                logger.warning(f"❌ Health check failed ({self.consecutive_failures}/{self.max_consecutive_failures})")
                
                if self.consecutive_failures >= self.max_consecutive_failures:
                    logger.error("🚨 Max consecutive failures reached, forcing session refresh")
                    self._force_session_refresh()
                    
                    if self.on_health_failure:
                        self.on_health_failure(self.consecutive_failures)
                    
                    time.sleep(self.failure_cooldown)
                    
        except Exception as e:
            logger.error(f"Health check error: {e}")
            self.consecutive_failures += 1
    
    def _check_forced_refresh(self):
        """Provjeri treba li forced refresh"""
        time_since_refresh = datetime.now() - self.last_forced_refresh
        
        if time_since_refresh.total_seconds() > self.forced_refresh_interval:
            logger.info("⏰ Scheduled session refresh")
            self._force_session_refresh()
    
    def _force_session_refresh(self):
        """Prisilno osvježi sesiju"""
        try:
            stats = self.browser_manager.get_session_stats()
            logger.info(f"🔄 Forcing session refresh. Stats: {stats}")
            
            self.browser_manager._refresh_session()
            
            self.last_forced_refresh = datetime.now()
            self.consecutive_failures = 0
            
            if self.on_session_refresh:
                self.on_session_refresh(stats)
                
        except Exception as e:
            logger.error(f"Forced refresh failed: {e}")
    
    def get_status(self) -> dict:
        """Dohvati status scheduler-a"""
        return {
            'is_running': self.is_running,
            'consecutive_failures': self.consecutive_failures,
            'last_health_check': self.last_health_check.isoformat() if self.last_health_check else None,
            'time_since_last_refresh': (datetime.now() - self.last_forced_refresh).total_seconds(),
            'next_forced_refresh_in': self.forced_refresh_interval - (datetime.now() - self.last_forced_refresh).total_seconds()
        }
