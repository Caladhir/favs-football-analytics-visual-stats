# scripts/backfill_recent.py
"""Backfill player & match stats for a recent day range.

Usage (example):
    python scripts/backfill_recent.py 2   # backfill last 2 days

It re-runs FetchLoop cycles with FETCH_PAST_HOURS expanded to cover the window
without sleeping between cycles, ensuring enrichment + fallback reconstruction
produce player_stats / match_stats rows for missed matches.
"""
from __future__ import annotations
import asyncio, os, sys
from datetime import datetime, timedelta

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, ROOT)

from scraper.fetch_loop import FetchLoop  # noqa
from core.database import db  # noqa

async def run(days: int):
    days = max(1, min(days, 7))  # safety cap 1..7
    hours = days * 24 + 2  # small buffer
    os.environ["FETCH_PAST_HOURS"] = str(hours)
    os.environ.setdefault("FETCH_FUTURE_HOURS", "6")
    os.environ.setdefault("FALLBACK_PLAYER_STATS", "1")
    os.environ.setdefault("LOG_PLAYER_STATS_DEBUG", "1")
    loop = FetchLoop(max_events=200)
    db.health_check()
    print(f"[backfill] Starting backfill for last {days} days (past_hours={hours})")
    # Run a few rapid cycles (3) to ensure late data merges
    for i in range(3):
        print(f"[backfill] cycle {i+1}/3")
        await loop.run_cycle()
        await asyncio.sleep(5)
    print("[backfill] Done.")

if __name__ == "__main__":
    d = 2
    if len(sys.argv) > 1:
        try:
            d = int(sys.argv[1])
        except Exception:
            pass
    asyncio.run(run(d))
