"""Enhanced Browser manager with Cloudflare mitigation (cookies, dual host, jitter, caching)."""

from __future__ import annotations

import os, time, json, random, threading, contextlib
from datetime import datetime
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.common.exceptions import WebDriverException, InvalidSessionIdException
from .config import config
from utils.logger import get_logger

logger = get_logger(__name__)


class BrowserManager:
    def __init__(self):
        self.driver = None
        self.session_start_time: datetime | None = None
        self.last_activity: datetime | None = None
        self.session_max_duration = int(getattr(config, "SESSION_MAX_DURATION", 3600))
        self.health_check_interval = int(getattr(config, "HEALTH_CHECK_INTERVAL", 300))
        self.session_lock = threading.Lock()
        self._stop_watchdog = threading.Event()
        self._resp_cache: dict[str, tuple[float, dict]] = {}
        self._setup_browser()
        self._start_watchdog()

    def _setup_browser(self):
        logger.info("Setting up browser...")
        options = webdriver.ChromeOptions()
        options.binary_location = config.BRAVE_PATH
        stability = [
            "--disable-blink-features=AutomationControlled",
            "--disable-dev-shm-usage",
            "--no-sandbox",
            "--disable-gpu",
            "--mute-audio",
            "--log-level=3",
            "--v=0",
        ]
        for opt in list(getattr(config, "CHROME_OPTIONS", [])) + stability:
            options.add_argument(opt)
        with contextlib.suppress(Exception):
            options.add_experimental_option("excludeSwitches", ["enable-automation", "enable-logging"])
            options.add_experimental_option("useAutomationExtension", False)
        prefs = {**getattr(config, "CHROME_PREFS", {}), "profile.managed_default_content_settings.images": 2}
        options.add_experimental_option("prefs", prefs)
        options.page_load_strategy = "eager"
        service = Service(config.CHROMEDRIVER_PATH)
        self.driver = webdriver.Chrome(service=service, options=options)
        self.driver.set_page_load_timeout(int(getattr(config, "PAGE_LOAD_TIMEOUT", 30)))
        self.driver.implicitly_wait(int(getattr(config, "IMPLICIT_WAIT", 10)))
        # Stealth basics
        stealth_js = (
            "Object.defineProperty(navigator,'webdriver',{get:() => undefined});"
            "Object.defineProperty(navigator,'languages',{get:() => ['en-US','en']});"
            "Object.defineProperty(navigator,'platform',{get:() => 'Win32'});"
        )
        with contextlib.suppress(Exception):
            self.driver.execute_cdp_cmd('Page.addScriptToEvaluateOnNewDocument', {'source': stealth_js})
        # Load cookies
        cookies_path = getattr(config, "SOFA_COOKIES_PATH", None)
        if cookies_path and os.path.exists(cookies_path):
            with contextlib.suppress(Exception):
                self.driver.get("https://www.sofascore.com/")
                with open(cookies_path, 'r', encoding='utf-8') as f:
                    for c in json.load(f):
                        c.pop('sameSite', None)
                        with contextlib.suppress(Exception):
                            self.driver.add_cookie(c)
                self.driver.refresh()
                logger.info("Loaded persisted cookies")
        self.session_start_time = datetime.now()
        self.last_activity = datetime.now()
        logger.info("✅ Browser started")

    def _is_session_valid(self) -> bool:
        try:
            if not self.driver:
                return False
            _ = self.driver.current_url
            return True
        except Exception:
            return False

    def _should_refresh_session(self) -> bool:
        if not self.session_start_time:
            return True
        return (datetime.now() - self.session_start_time).total_seconds() > self.session_max_duration

    def _refresh_session(self):
        logger.info("Refreshing session...")
        with contextlib.suppress(Exception):
            if self.driver:
                self.driver.quit()
        self.driver = None
        self._setup_browser()

    def _ensure_valid_session(self):
        with self.session_lock:
            if (not self._is_session_valid()) or self._should_refresh_session():
                self._refresh_session()
            self.last_activity = datetime.now()

    def _start_watchdog(self):
        def loop():
            while not self._stop_watchdog.is_set():
                try:
                    if self._should_refresh_session():
                        self._refresh_session()
                    else:
                        self.health_check()
                finally:
                    self._stop_watchdog.wait(self.health_check_interval)
        threading.Thread(target=loop, daemon=True).start()

    def _build_api_url(self, endpoint: str) -> str:
        if endpoint.startswith('http://') or endpoint.startswith('https://'):
            return endpoint
        ep = endpoint.lstrip('/')
        base = 'https://www.sofascore.com/api/v1'
        no_pref = ("event/","team/","player/","manager/","unique-tournament","tournament/","category/","search","season/","coach/")
        if any(ep.startswith(p) for p in no_pref):
            return f"{base}/{ep}"
        return f"{base}/sport/football/{ep}"

    def fetch_data(self, endpoint: str, max_retries: int = 3) -> dict:
        ep_l = (endpoint or '').lower()
        if 'player-statistics' in ep_l:
            return {"__error__": 451, "__msg__": "blocked endpoint", "endpoint": endpoint}
        # cache
        ttl = float(getattr(config, 'FETCH_CACHE_TTL', 5.0))
        now = time.time()
        ce = self._resp_cache.get(endpoint)
        if ce and (now - ce[0]) < ttl:
            return ce[1]
        # jitter
        jitter = float(getattr(config, 'FETCH_JITTER_MAX', 0.0))
        if jitter > 0:
            time.sleep(random.uniform(0, jitter))
        for attempt in range(max_retries):
            try:
                self._ensure_valid_session()
                with contextlib.suppress(Exception):
                    cur = self.driver.current_url
                if not cur or 'sofascore.com' not in cur:
                    self.driver.get('https://www.sofascore.com/')
                    time.sleep(1)
                full_url = self._build_api_url(endpoint)
                rel_path = full_url.split('/api/v1/', 1)[-1].lstrip('/')
                hosts = ['https://api.sofascore.com/api/v1', 'https://www.sofascore.com/api/v1']
                script = """
const rel = %s;
const hosts = %s;
async function go(){
  for (const h of hosts){
    try {
      const r = await fetch(h + '/' + rel, {headers:{'Accept':'application/json, text/plain, */*','Accept-Language':'en-US,en;q=0.9','Referer':'https://www.sofascore.com/'}, credentials:'include'});
      if(!r.ok) continue;
      const t = await r.text();
      if(t && (t.includes('Attention Required') || t.includes('cf-browser-verification'))){
        return {__error__:403,__msg__:'cloudflare_challenge'};
      }
      try { return JSON.parse(t); } catch(e){ return {__error__:499,__msg__:'invalid json'}; }
    } catch(e) { continue; }
  }
  return {__error__:404};
}
return go();
""" % (json.dumps(rel_path), json.dumps(hosts))
                result = self.driver.execute_script(script)
                if isinstance(result, dict):
                    if result.get('__error__'):
                        return result
                    self._resp_cache[endpoint] = (time.time(), result)
                    self.last_activity = datetime.now()
                    return result
                raise Exception('invalid response format')
            except Exception as e:
                if attempt < max_retries - 1:
                    wait = (attempt + 1) * 2 + random.uniform(0, 1.0)
                    time.sleep(wait)
                    continue
                return {"__error__": 598, "__msg__": f"failed after retries: {e}"}

    def fetch_json(self, endpoint: str, max_retries: int = 3) -> dict:
        return self.fetch_data(endpoint, max_retries)

    def health_check(self) -> bool:
        try:
            if not self._is_session_valid():
                return False
            _ = self.driver.execute_script("return Date.now();")
            return True
        except Exception:
            return False

    def get_session_stats(self) -> dict:
        if not self.session_start_time:
            return {}
        return {
            'session_duration_hours': (datetime.now() - self.session_start_time).total_seconds()/3600,
            'last_activity_minutes_ago': (datetime.now() - self.last_activity).total_seconds()/60 if self.last_activity else None,
            'session_valid': self._is_session_valid(),
            'should_refresh': self._should_refresh_session(),
        }

    def close(self):
        try:
            self._stop_watchdog.set()
            if self.driver:
                with contextlib.suppress(Exception):
                    cookies_path = getattr(config, "SOFA_COOKIES_PATH", None)
                    if cookies_path:
                        with contextlib.suppress(Exception):
                            cookies = self.driver.get_cookies()
                            with open(cookies_path, 'w', encoding='utf-8') as f:
                                json.dump(cookies, f)
                            logger.info("Saved cookies")
                    self.driver.quit()
                logger.info("✅ Browser closed")
        finally:
            self.driver = None
            self.session_start_time = None
            self.last_activity = None

    def cleanup_resources(self):
        self.close()


Browser = BrowserManager
