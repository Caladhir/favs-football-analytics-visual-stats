# scraper/main.py - Updated to work with refactored fetch_loop.py
from __future__ import annotations
import argparse
import os
import sys

# --- fleksibilni importi / PYTHONPATH ---
ROOT = os.path.abspath(os.path.dirname(__file__))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)
SCRAPER_DIR = os.path.join(ROOT, "scraper")
if os.path.isdir(SCRAPER_DIR) and SCRAPER_DIR not in sys.path:
    sys.path.insert(0, SCRAPER_DIR)

try:
    from utils.logger import get_logger
except Exception:
    import logging
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    def get_logger(name): 
        return logging.getLogger(name)

logger = get_logger(__name__)

# --- fetch_loop import (radi i kao scraper.fetch_loop i kao fetch_loop) ---
try:
    from scraper.fetch_loop import main as loop_main, run_once, fetch_raw, FetchLoop
except Exception:
    from fetch_loop import main as loop_main, run_once, fetch_raw, FetchLoop  # type: ignore

def cli():
    """Command line interface"""
    p = argparse.ArgumentParser(description="SofaScore fetch runner")
    p.add_argument("--once", action="store_true", help="Pokreni jedan ciklus (korisno za cron)")
    p.add_argument("--date", type=str, help="Datum za fetch (YYYY-MM-DD format)")
    p.add_argument("--interval", type=int, default=30, help="Interval između ciklusa u sekundama (default: 30)")
    p.add_argument("--max-failures", type=int, default=5, help="Maksimalno uzastopnih neuspjeha (default: 5)")
    args = p.parse_args()

    if args.once:
        logger.info("main | Running single cycle...")
        success = run_once(date_str=args.date)
        if success:
            logger.info("✅ Single cycle completed successfully")
        else:
            logger.error("❌ Single cycle failed")
        sys.exit(0 if success else 1)
    else:
        logger.info("main | Running continuous loop...")
        loop = FetchLoop()
        try:
            loop.run_continuous(interval=args.interval, max_failures=args.max_failures)
        except KeyboardInterrupt:
            logger.info("Interrupted by user")
        finally:
            loop._cleanup()

if __name__ == "__main__":
    cli()