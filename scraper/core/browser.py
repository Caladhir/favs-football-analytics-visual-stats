# scraper/core/browser.py 
import time
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from .config import config
from utils.logger import get_logger

logger = get_logger(__name__)

class BrowserManager:
    """Upravljanje browser sesijom s enhanced stability"""
    
    def __init__(self):
        self.driver = None
        self._setup_browser()
    
    def _setup_browser(self):
        """Postavi browser s optimiziranim opcijama"""
        logger.info("Setting up browser...")
        
        try:
            options = webdriver.ChromeOptions()
            options.binary_location = config.BRAVE_PATH
            
            for option in config.CHROME_OPTIONS:
                options.add_argument(option)
            
            options.add_experimental_option("prefs", config.CHROME_PREFS)
            options.page_load_strategy = 'eager'
            
            self.driver = webdriver.Chrome(
                service=Service(config.CHROMEDRIVER_PATH),
                options=options
            )
            
            self.driver.set_page_load_timeout(config.PAGE_LOAD_TIMEOUT)
            self.driver.implicitly_wait(config.IMPLICIT_WAIT)
            
            logger.info("✅ Browser started successfully")
            
        except Exception as e:
            logger.error(f"❌ Failed to start browser: {e}")
            raise
    
    def fetch_data(self, endpoint: str, max_retries: int = 3) -> dict:
        """Fetch data s retry logikom"""
        for attempt in range(max_retries):
            try:
                logger.info(f"Fetching {endpoint} (attempt {attempt + 1}/{max_retries})")
                
                if attempt == 0:
                    logger.info("Navigating to SofaScore...")
                    self.driver.get("https://www.sofascore.com/")
                    
                    try:
                        self.driver.execute_script("return document.readyState") == "complete"
                        time.sleep(2)
                    except:
                        time.sleep(5)
                
                api_url = f"https://www.sofascore.com/api/v1/sport/football/{endpoint}"
                
                script = f"""
                    console.log('Fetching: {api_url}');
                    return fetch("{api_url}", {{
                        headers: {{
                            "Accept": "application/json, text/plain, */*",
                            "Referer": "https://www.sofascore.com/",
                            "User-Agent": navigator.userAgent
                        }}
                    }})
                    .then(res => {{
                        console.log('Response status:', res.status);
                        if (!res.ok) throw new Error('HTTP ' + res.status);
                        return res.json();
                    }})
                    .catch(err => {{
                        console.error('Fetch error:', err);
                        throw err;
                    }});
                """
                
                result = self.driver.execute_script(script)
                
                if result and isinstance(result, dict):
                    logger.info(f"✅ Successfully fetched {endpoint}")
                    return result
                else:
                    raise Exception(f"Invalid response format: {type(result)}")
                    
            except Exception as e:
                logger.error(f"❌ Attempt {attempt + 1} failed: {str(e)}")
                
                if attempt < max_retries - 1:
                    wait_time = (attempt + 1) * 2 
                    logger.info(f"Waiting {wait_time}s before retry...")
                    time.sleep(wait_time)
                    
                    try:
                        self.driver.execute_script("window.location.reload();")
                        time.sleep(3)
                    except:
                        logger.warning("Failed to reload page")
                else:
                    logger.error(f"All attempts failed for {endpoint}")
                    raise Exception(f"Failed to fetch {endpoint} after {max_retries} attempts")
    
    def health_check(self) -> bool:
        """Provjeri health browsera"""
        try:
            start_time = time.time()
            
            result = self.driver.execute_script("""
                return {
                    url: window.location.href,
                    readyState: document.readyState,
                    userAgent: navigator.userAgent.substring(0, 50),
                    memoryUsage: performance.memory ? {
                        used: performance.memory.usedJSHeapSize,
                        total: performance.memory.totalJSHeapSize,
                        limit: performance.memory.jsHeapSizeLimit
                    } : null,
                    timestamp: Date.now()
                };
            """)
            
            response_time = time.time() - start_time
            
            logger.info(f"Browser response time: {response_time:.2f}s")
            
            if result.get('memoryUsage'):
                memory = result['memoryUsage']
                used_mb = memory['used'] / 1024 / 1024
                total_mb = memory['total'] / 1024 / 1024
                usage_pct = (memory['used'] / memory['total']) * 100
                
                logger.info(f"Browser memory: {used_mb:.1f}/{total_mb:.1f}MB ({usage_pct:.1f}%)")
                
                if usage_pct > 80:
                    logger.warning(f"High memory usage ({usage_pct:.1f}%)")
                    return False
            
            if response_time > 5:
                logger.warning(f"Slow browser response ({response_time:.2f}s)")
                return False
                
            logger.info("✅ Browser is healthy")
            return True
            
        except Exception as e:
            logger.error(f"❌ Browser health check failed: {e}")
            return False
    
    def cleanup_resources(self):
        """Cleanup browser memorije"""
        try:
            logger.info("Cleaning browser resources...")
            
            self.driver.execute_script("""
                if (window.gc) {
                    window.gc();
                }
                
                // Clear caches
                if ('caches' in window) {
                    caches.keys().then(names => {
                        names.forEach(name => caches.delete(name));
                    });
                }
                
                // Clear console
                console.clear();
                
                return 'cleanup_done';
            """)
            
            logger.info("✅ Browser cleanup completed")
            
        except Exception as e:
            logger.warning(f"⚠️ Browser cleanup failed: {e}")
    
    def close(self):
        """Zatvori browser"""
        if self.driver:
            try:
                self.cleanup_resources()
                self.driver.quit()
                logger.info("✅ Browser closed successfully")
            except Exception as e:
                logger.warning(f"⚠️ Error closing browser: {e}")