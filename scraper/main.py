# scraper/main.py - 
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

# --- fetch_loop import (import only FetchLoop which exists in current fetch_loop.py) ---
try:
    from scraper.fetch_loop import FetchLoop
except Exception:
    from fetch_loop import FetchLoop  # type: ignore

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
        # run a single async cycle using the current FetchLoop API
        import asyncio
        loop = FetchLoop()
        try:
            loop = FetchLoop()
            # FetchLoop.run_cycle() does not accept parameters in the current API
            # so call it without passing date_str.
            res = asyncio.run(loop.run_cycle()) if hasattr(loop, 'run_cycle') else asyncio.run(loop.run_once())
            ok = bool(isinstance(res, dict) and res.get('success')) or bool(res)
            if ok:
                logger.info("✅ Single cycle completed successfully")
            else:
                logger.error("❌ Single cycle failed")
            sys.exit(0 if ok else 1)
        except AttributeError:
            # Fallback: try a synchronous method if available
            try:
                success = loop.run_once(date_str=args.date)  # type: ignore
                sys.exit(0 if success else 1)
            except Exception as e:
                logger.error(f"main | Single cycle failed fallback: {e}")
                sys.exit(2)
    else:
        logger.info("main | Running continuous loop... (uses FetchLoop.run_cycle in interval)")
        import time, asyncio
        fl = FetchLoop()
        try:
            while True:
                try:
                    asyncio.run(fl.run_cycle())
                except Exception as e:
                    logger.error(f"Error during run_cycle: {e}")
                time.sleep(args.interval)
        except KeyboardInterrupt:
            logger.info("Interrupted by user")
        finally:
            # best-effort cleanup
            try:
                if hasattr(fl, '_cleanup'):
                    fl._cleanup()
            except Exception:
                pass

if __name__ == "__main__":
    cli()