# fetch_loop.py - POBOLJŠANA VERZIJA
import time
import os
import subprocess
import signal
import sys
from datetime import datetime

class ScraperLoop:
    def __init__(self, interval=10):  # Smanjeno s 15 na 10 sekundi
        self.interval = interval
        self.running = True
        
    def signal_handler(self, signum, frame):
        print(f"\n[INFO] Received signal {signum}, shutting down gracefully...")
        self.running = False
        
    def run_scraper(self):
        """Run scraper with better error handling and visible output"""
        try:
            print(f"[{datetime.now().strftime('%H:%M:%S')}] Starting scraper...")
            
            # 🔧 POBOLJŠANO: Uklanjamo capture_output da vidimo poruke
            result = subprocess.run(
                ["python", "scraper/sofascore_scraper.py"], 
                text=True, 
                timeout=120  # 2 minute timeout
                # Uklanjamo capture_output=True da vidimo output u realtime
            )
            
            if result.returncode == 0:
                print(f"[{datetime.now().strftime('%H:%M:%S')}] Scraper completed successfully")
            else:
                print(f"[{datetime.now().strftime('%H:%M:%S')}] Scraper failed with code {result.returncode}")
                
        except subprocess.TimeoutExpired:
            print(f"[{datetime.now().strftime('%H:%M:%S')}] Scraper timed out after 2 minutes")
        except Exception as e:
            print(f"[{datetime.now().strftime('%H:%M:%S')}] Failed to run scraper: {e}")
    
    def start(self):
        """Main loop with graceful shutdown"""
        print(f"[INFO] Starting scraper loop (every {self.interval}s)")
        print("[INFO] Press Ctrl+C to stop gracefully")
        
        # Register signal handler for graceful shutdown
        signal.signal(signal.SIGINT, self.signal_handler)
        signal.signal(signal.SIGTERM, self.signal_handler)
        
        # Pokreni odmah prvi put
        self.run_scraper()
        
        while self.running:
            try:
                # Sleep with interruption check
                print(f"[{datetime.now().strftime('%H:%M:%S')}] Waiting {self.interval}s...")
                for _ in range(self.interval):
                    if not self.running:
                        break
                    time.sleep(1)
                
                if self.running:  # Ako nismo prekinuli
                    self.run_scraper()
                    
            except KeyboardInterrupt:
                print("\n[INFO] Keyboard interrupt received")
                self.running = False
            except Exception as e:
                print(f"[ERROR] Unexpected error in main loop: {e}")
                time.sleep(5)  # Wait before retrying
        
        print("[INFO] Scraper loop stopped")

if __name__ == "__main__":
    # Kraći interval za brže ažuriranje live utakmica
    interval = 10  # seconds
    
    scraper = ScraperLoop(interval)
    scraper.start()