# scraper/core/browser.py - STABLE ENHANCED VERSION (auto-refresh session + watchdog)
import time
import threading
import contextlib
from datetime import datetime
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.common.exceptions import (
    WebDriverException,
    InvalidSessionIdException,
)
from .config import config
from utils.logger import get_logger

logger = get_logger(__name__)

class BrowserManager:
    """Chrome/Brave manager sa session watchdogom i auto-refreshom."""

    def __init__(self):
        self.driver = None
        self.session_start_time: datetime | None = None
        self.last_activity: datetime | None = None

        # ✅ umjesto config.get(...) koristimo getattr s defaultom
        self.session_max_duration = int(getattr(config, "SESSION_MAX_DURATION", 3600))  # 1h
        self.health_check_interval = int(getattr(config, "HEALTH_CHECK_INTERVAL", 300))  # 5min

        self.session_lock = threading.Lock()
        self._stop_watchdog = threading.Event()  # ✅ bilo je nedostajalo
        self._setup_browser()
        self._start_watchdog()

    # ---------- internals ----------

    def _setup_browser(self):
        """Pokreni Chrome/Brave s optimiziranim opcijama."""
        logger.info("Setting up browser...")
        try:
            options = webdriver.ChromeOptions()
            options.binary_location = config.BRAVE_PATH

            stability_options = [
                "--disable-blink-features=AutomationControlled",
                "--disable-dev-shm-usage",
                "--no-sandbox",
                "--disable-gpu",
                "--disable-extensions",
                "--disable-plugins",
                "--mute-audio",
                "--disable-background-timer-throttling",
                "--disable-renderer-backgrounding",
                "--disable-backgrounding-occluded-windows",
            ]

            for opt in list(getattr(config, "CHROME_OPTIONS", [])) + stability_options:
                options.add_argument(opt)

            # prefs (blokiramo slike radi brzine)
            prefs = {
                **getattr(config, "CHROME_PREFS", {}),
                "profile.managed_default_content_settings.images": 2,
                "profile.default_content_setting_values.notifications": 2,
            }
            options.add_experimental_option("prefs", prefs)

            options.page_load_strategy = "eager"

            self.driver = webdriver.Chrome(
                service=Service(config.CHROMEDRIVER_PATH),
                options=options,
            )
            self.driver.set_page_load_timeout(int(getattr(config, "PAGE_LOAD_TIMEOUT", 30)))
            self.driver.implicitly_wait(int(getattr(config, "IMPLICIT_WAIT", 10)))

            self.session_start_time = datetime.now()
            self.last_activity = datetime.now()
            logger.info("✅ Browser started successfully")
        except Exception as e:
            logger.error(f"❌ Failed to start browser: {e}")
            raise

    def _is_session_valid(self) -> bool:
        """Provjeri da je WebDriver sesija živa."""
        try:
            if not self.driver:
                return False
            _ = self.driver.current_url  # ping
            return True
        except (InvalidSessionIdException, WebDriverException):
            return False
        except Exception as e:
            logger.warning(f"Session validation error: {e}")
            return False

    def _should_refresh_session(self) -> bool:
        """Treba li obnoviti sesiju zbog starosti."""
        if not self.session_start_time:
            return True
        age = (datetime.now() - self.session_start_time).total_seconds()
        return age > self.session_max_duration

    def _refresh_session(self):
        """Tvrdi refresh cijelog browsera."""
        logger.info("🔄 Refreshing browser session...")
        try:
            if self.driver:
                with contextlib.suppress(Exception):
                    self.driver.quit()
        finally:
            self.driver = None

        self._setup_browser()
        logger.info("✅ Session refreshed successfully")

    def _ensure_valid_session(self):
        """Centralna točka: osiguraj valjan driver, osvježi ako treba."""
        with self.session_lock:
            if (not self._is_session_valid()) or self._should_refresh_session():
                self._refresh_session()
            self.last_activity = datetime.now()

    def _build_api_url(self, endpoint: str) -> str:
        # Ako je već pun URL, koristi ga
        if endpoint.startswith("http://") or endpoint.startswith("https://"):
            return endpoint

        ep = endpoint.lstrip("/")

        # End-pointi koji NEMAJU /sport/football prefiks
        no_sport_prefixes = (
            "event/",            # npr. event/14357790/lineups, incidents, statistics, managers, h2h, graph...
            "team/",             # team/3002, team/3002/performance
            "player/",           # player/921803/characteristics
            "manager/",          # manager/795757
            "unique-tournament", # unique-tournament/170/season/76980/top-teams/overall
            "tournament/",       # ako ikad koristiš /tournament/...
            "category/", "search", "season/", "coach/"  # sigurnosna mreža
        )

        base = "https://www.sofascore.com/api/v1"

        if any(ep.startswith(p) for p in no_sport_prefixes):
            return f"{base}/{ep}"
        else:
            # npr. events/live, scheduled-events/2025-08-15
            return f"{base}/sport/football/{ep}"


    def _with_session(self, fn, *, retries: int = 1, on_retry_wait: float = 1.0):
        """
        Izvrši fn() uz auto-refresh sesije na InvalidSessionId/WebDriverException.
        """
        for attempt in range(retries + 1):
            try:
                self._ensure_valid_session()
                return fn()
            except (InvalidSessionIdException, WebDriverException) as e:
                logger.warning(
                    f"Driver call failed ({type(e).__name__}), "
                    f"attempt {attempt + 1}/{retries + 1}"
                )
                if attempt < retries:
                    self._refresh_session()
                    time.sleep(on_retry_wait)
                    continue
                raise

    def _start_watchdog(self):
        """Pozadinski thread koji periodički provjerava i/ili obnavlja sesiju."""
        def _loop():
            while not self._stop_watchdog.is_set():
                try:
                    if self._should_refresh_session():
                        logger.info("🕑 Watchdog: session too old → refreshing")
                        self._refresh_session()
                    else:
                        # lagani ping – bez stroge greške ako ne uspije
                        self.health_check()
                except Exception as e:
                    logger.warning(f"Watchdog warning: {e}")
                finally:
                    self._stop_watchdog.wait(self.health_check_interval)

        t = threading.Thread(target=_loop, daemon=True)
        t.start()

    # ---------- public API ----------

    def fetch_data(self, endpoint: str, max_retries: int = 3) -> dict:
        """
        Dohvati JSON s SofaScore API-ja preko browsera.
        Automatski rješava invalid session i radi retrye s eksponencijalnim čekanjem.
        """
        for attempt in range(max_retries):
            try:
                logger.info(f"Fetching {endpoint} (attempt {attempt + 1}/{max_retries})")

                # 1) osiguraj da smo na sofascore.com (wrapano kroz _with_session)
                def _nav():
                    cur = ""
                    with contextlib.suppress(Exception):
                        cur = self.driver.current_url
                    if not cur or "sofascore.com" not in cur:
                        logger.info("Navigating to SofaScore...")
                        self.driver.get("https://www.sofascore.com/")
                        time.sleep(2)
                self._with_session(_nav, retries=1)

                # 2) pokupi JSON
                api_url = self._build_api_url(endpoint)
                script = f"""
                    return fetch("{api_url}", {{
                        headers: {{
                            "Accept": "application/json, text/plain, */*",
                            "Referer": "https://www.sofascore.com/",
                            "User-Agent": navigator.userAgent
                        }}
                    }}).then(async r => {{
                        if (!r.ok) {{
                            // NE bacaj grešku - vrati status da Python može pristojno reagirati
                            return {{ __error__: r.status }};
                        }}
                        try {{
                            const data = await r.json();
                            return data;
                        }} catch (e) {{
                            return {{ __error__: 499, __msg__: "invalid json" }};
                        }}
                    }});
                """


                def _exec():
                    return self.driver.execute_script(script)

                result = self._with_session(_exec, retries=1)

                if isinstance(result, dict):
                    # ako API vrati non-OK status (npr. 404), dobit ćemo {"__error__": 404}
                    if result.get("__error__"):
                        status = result["__error__"]
                        logger.warning(f"Fetch {endpoint} returned non-OK status: {status}")
                        self.last_activity = datetime.now()
                        return result  # vrati da viši sloj može pristojno preskočiti

                    # ✅ normalan uspješan JSON odgovor
                    logger.info(f"✅ Successfully fetched {endpoint}")
                    self.last_activity = datetime.now()
                    return result

                raise Exception(f"Invalid response format: {type(result)}")


            except Exception as e:
                logger.error(f"❌ Attempt {attempt + 1} failed for {endpoint}: {e}")
                if attempt < max_retries - 1:
                    wait = (attempt + 1) * 2
                    logger.info(f"Waiting {wait}s before retry...")
                    time.sleep(wait)
                    continue
                logger.error(f"All attempts failed for {endpoint}")
                raise Exception(f"Failed to fetch {endpoint} after {max_retries} attempts")

    def fetch_json(self, endpoint: str, max_retries: int = 3) -> dict:
        """
        🔧 ALIAS za fetch_data - za kompatibilnost s postojećim kodom
        """
        return self.fetch_data(endpoint, max_retries)

    def health_check(self) -> bool:
        """Lagani JS ping; vraća False ako je sporo ili invalid session."""
        try:
            if not self._is_session_valid():
                logger.warning("Health check failed: Invalid session")
                return False

            start = time.time()
            _ = self.driver.execute_script(
                "return {href: location.href, rs: document.readyState, ts: Date.now()};"
            )
            dt = time.time() - start
            if dt > 10:
                logger.warning(f"Slow health check response: {dt:.2f}s")
                return False

            age_h = (datetime.now() - self.session_start_time).total_seconds() / 3600
            logger.info(f"✅ Health check OK (session age: {age_h:.1f}h)")
            return True
        except Exception as e:
            logger.error(f"❌ Health check failed: {e}")
            return False

    def get_session_stats(self) -> dict:
        if not self.session_start_time:
            return {}
        dur = datetime.now() - self.session_start_time
        last = (datetime.now() - self.last_activity).total_seconds() / 60 if self.last_activity else None
        return {
            "session_duration_hours": dur.total_seconds() / 3600,
            "last_activity_minutes_ago": last,
            "session_valid": self._is_session_valid(),
            "should_refresh": self._should_refresh_session(),
        }

    def close(self):
        """Zatvori sve uredno."""
        try:
            self._stop_watchdog.set()
            if self.driver:
                with contextlib.suppress(Exception):
                    self.driver.quit()
                logger.info("✅ Browser closed successfully")
        except Exception as e:
            logger.error(f"Error closing browser: {e}")
        finally:
            self.driver = None
            self.session_start_time = None
            self.last_activity = None
    
    def cleanup_resources(self):
        """Clean up browser resources (alias for close)"""
        logger.info("Cleaning up browser resources...")
        pass

# Ako modul izlaže samo BrowserManager, napravi alias:
try:
    Browser  # noqa: F401
except NameError:
    try:
        Browser = BrowserManager  # noqa: F401
    except NameError:
        pass