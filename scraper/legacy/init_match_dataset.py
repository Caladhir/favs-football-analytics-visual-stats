"""Historical ingest entrypoint (clean minimal wrapper).

Fetches events for a date range (past + future) and delegates all heavy lifting
(fetch, enrich, process, standings, store) to pipeline modules so logic stays
single-sourced with the live fetch loop.

Examples:
  python -m scraper.legacy.init_match_dataset --start 2024-08-01 --end 2024-08-07 --dry-run
  python -m scraper.legacy.init_match_dataset --days-back 30 --days-forward 7
"""
from __future__ import annotations

import sys
import argparse
import contextlib
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List

THIS = Path(__file__).resolve()
SCRAPER_DIR = THIS.parents[1]
if str(SCRAPER_DIR) not in sys.path:
    sys.path.insert(0, str(SCRAPER_DIR))

from utils.logger import get_logger
try:  # Prefer direct Browser; fall back to manager alias
    from core.browser import Browser
except Exception:  # pragma: no cover
    from core.browser import BrowserManager as Browser

from pipeline import fetch_day, enrich_event, store_bundle, build_standings
from processors.match_processor import MatchProcessor
from core.config import SOFA_TOURNAMENTS_ALLOW
try:  # optional enhanced name-based filter
    from utils.leagues_filter import should_track_match  # type: ignore
except Exception:  # pragma: no cover
    def should_track_match(_: dict) -> bool:  # type: ignore
        return True

logger = get_logger(__name__)

DAYS_BACK_DEFAULT = 365 * 2
DAYS_FWD_DEFAULT = 365

# ---------------------------- helpers ------------------------------------- #

def daterange(start: datetime, end: datetime) -> List[datetime]:
    cur = start
    out: List[datetime] = []
    while cur <= end:
        out.append(cur)
        cur += timedelta(days=1)
    return out


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Initialize match dataset using unified pipeline modules")
    p.add_argument("--days-back", type=int, default=DAYS_BACK_DEFAULT, help="How many days back from today if --start not supplied")
    p.add_argument("--days-forward", type=int, default=DAYS_FWD_DEFAULT, help="How many days forward from today if --end not supplied")
    p.add_argument("--start", type=str, help="Explicit start YYYY-MM-DD (UTC)")
    p.add_argument("--end", type=str, help="Explicit end YYYY-MM-DD (UTC)")
    p.add_argument("--limit-days", type=int, help="Clamp total number of days from start")
    p.add_argument("--throttle", type=float, default=0.0, help="Sleep seconds after each network call")
    p.add_argument("--dry-run", action="store_true", help="Do not persist – just log bundle sizes")
    p.add_argument("--max-events-per-day", type=int, help="Cap number of events per day (debug / speed)")
    p.add_argument("--tournaments", type=str, help="Comma-separated uniqueTournament IDs allowlist (overrides env)")
    return p.parse_args()


def resolve_range(args: argparse.Namespace) -> tuple[datetime, datetime]:
    today = datetime.now(timezone.utc)
    if args.start:
        start = datetime.fromisoformat(args.start).replace(tzinfo=timezone.utc)
    else:
        start = (today - timedelta(days=args.days_back)).replace(hour=0, minute=0, second=0, microsecond=0)
    if args.end:
        end = datetime.fromisoformat(args.end).replace(tzinfo=timezone.utc)
    else:
        end = (today + timedelta(days=args.days_forward)).replace(hour=0, minute=0, second=0, microsecond=0)
    if args.limit_days is not None:
        total = (end.date() - start.date()).days + 1
        if total > args.limit_days:
            end = (start + timedelta(days=args.limit_days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return start, end


def run_day(browser: Browser, processor: MatchProcessor, day: datetime, *, throttle: float, dry_run: bool, max_events: int | None):
    dstr = day.strftime('%Y-%m-%d')
    events = fetch_day(browser, day, throttle=throttle)
    if not events:
        logger.info(f"[day] {dstr} events=0")
        return {}
    # Apply tournament allow-list (CLI overrides env)
    allow = None
    try:
        allow = getattr(run_day, "_allow_cache", None)
    except Exception:
        allow = None
    if allow is None:
        allow = getattr(run_day, "_allow_ids", None)
    # allow is injected in main before loop via function attribute
    if getattr(run_day, "_allow_ids", None):
        def _ut(ev):
            try:
                return int((ev.get("tournament") or {}).get("uniqueTournament", {}).get("id"))
            except Exception:
                return None
        before = len(events)
        # Keep event if ID in allow_ids OR (fallback) passes name-based tracking
        allow_ids = run_day._allow_ids  # type: ignore[attr-defined]
        events = [ev for ev in events if (_ut(ev) in allow_ids) or should_track_match(ev)]
        if before != len(events):
            logger.info(f"[allowlist] filtered events {before}->{len(events)} (allow_ids+name_fallback)")
    else:
        # No explicit IDs -> rely purely on name-based decision
        before = len(events)
        events = [ev for ev in events if should_track_match(ev)]
        if before != len(events):
            logger.info(f"[allowlist] name-only filtered events {before}->{len(events)}")
    if max_events and len(events) > max_events:
        events = events[:max_events]
    enriched = []
    for ev in events:
        try:
            enriched.append(enrich_event(browser, ev, throttle=throttle))
        except Exception as ex:  # keep going – log at debug granularity
            logger.debug(f"[enrich][skip] eid={ev.get('id')} err={ex}")
    if not enriched:
        logger.info(f"[day] {dstr} enriched=0 (all failed)")
        return {}
    bundle = processor.process(enriched)
    standings_rows = build_standings(browser, enriched, throttle=throttle)
    if standings_rows:
        bundle["standings"] = standings_rows
    # Diagnostic: log bundle composition BEFORE persistence to detect production-time filtering issues.
    logger.debug("[bundle.pre_store] " + ", ".join(f"{k}={len(v)}" for k,v in bundle.items()))
    if dry_run:
        logger.info(f"[DRY] {dstr} " + ", ".join(f"{k}={len(v)}" for k,v in bundle.items()))
        return {k: len(v) for k,v in bundle.items()}
    counts = store_bundle(bundle, browser=browser, throttle=throttle)
    logger.info(f"[saved] {dstr} " + ", ".join(f"{k}={counts.get(k)}" for k in counts))
    return counts


# ---------------------------- main ---------------------------------------- #

def main():
    args = parse_args()
    start, end = resolve_range(args)
    days = daterange(start, end)
    logger.info(f"[init] range {start.date()} -> {end.date()} days={len(days)} dry_run={args.dry_run}")

    # Resolve allow-list (CLI overrides env SOFA_TOURNAMENTS_ALLOW)
    allow_ids = set()
    if args.tournaments:
        try:
            allow_ids = {int(x) for x in args.tournaments.split(",") if x.strip().isdigit()}
        except Exception:
            allow_ids = set()
    elif SOFA_TOURNAMENTS_ALLOW:
        allow_ids = set(SOFA_TOURNAMENTS_ALLOW)
    if allow_ids:
        logger.info(f"[allowlist] active uniqueTournament ids count={len(allow_ids)} sample={list(allow_ids)[:8]}")
        setattr(run_day, "_allow_ids", allow_ids)

    browser = Browser()
    processor = MatchProcessor()
    totals: dict[str, int] = {}
    try:
        for day in days:
            counts = run_day(browser, processor, day, throttle=args.throttle, dry_run=args.dry_run, max_events=args.max_events_per_day)
            for k, v in counts.items():
                if isinstance(v, int):
                    totals[k] = totals.get(k, 0) + v
        if not args.dry_run and totals:
            logger.info("[totals] " + ", ".join(f"{k}={v}" for k,v in totals.items()))
    finally:
        with contextlib.suppress(Exception):
            browser.close()


if __name__ == "__main__":  # pragma: no cover
    main()
