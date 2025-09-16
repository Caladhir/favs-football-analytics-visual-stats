"""Backfill recent player_stats for a rolling window using unified fetch/enrich logic.

Usage (examples):
  python scripts/backfill_recent_player_stats.py --days 7
  python scripts/backfill_recent_player_stats.py --start 2025-09-05 --end 2025-09-12

Behaviour:
  - Iterates days in range, fetches scheduled-events/{date} plus incidents/lineups/statistics.
  - Does NOT call deprecated player-statistics endpoint.
  - Reconstructs player_stats via fallback when raw stats missing.
  - Upserts only player_stats (and dependent entities if needed: players, matches, teams) by reusing FetchLoop processing pieces.

ENV:
  FETCH_PAST_HOURS / FETCH_FUTURE_HOURS not used here (explicit date iteration).
  FALLBACK_PLAYER_STATS respected (default on).
"""
from __future__ import annotations
import sys, os, argparse
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any

SCRAPER_DIR = os.path.join(os.path.dirname(__file__), '..', 'scraper')
if SCRAPER_DIR not in sys.path:
    sys.path.insert(0, SCRAPER_DIR)

from core.browser import Browser
from core.database import db
from fetch_loop import FetchLoop  # reuse parsing helpers
from processors import MatchProcessor, stats_processor
from processors.stats_processor import build_player_stats_fallback
from utils.logger import get_logger

logger = get_logger(__name__)


def iter_days(start: datetime, end: datetime):
    cur = start
    while cur <= end:
        yield cur
        cur += timedelta(days=1)


def parse_args():
    p = argparse.ArgumentParser(description='Backfill recent player_stats.')
    p.add_argument('--days', type=int, default=7, help='If start/end not provided, go back N days from today (UTC) inclusive.')
    p.add_argument('--start', type=str, help='Start date YYYY-MM-DD (UTC)')
    p.add_argument('--end', type=str, help='End date YYYY-MM-DD (UTC)')
    p.add_argument('--dry-run', action='store_true')
    return p.parse_args()


def main():
    args = parse_args()
    if args.start and args.end:
        start = datetime.fromisoformat(args.start).replace(tzinfo=timezone.utc)
        end = datetime.fromisoformat(args.end).replace(tzinfo=timezone.utc)
    else:
        end = datetime.now(timezone.utc)
        start = (end - timedelta(days=args.days-1)).replace(hour=0, minute=0, second=0, microsecond=0)
        end = end.replace(hour=0, minute=0, second=0, microsecond=0)
    logger.info(f'[backfill] range {start.date()} -> {end.date()} dry_run={args.dry_run}')

    browser = Browser()
    mp = MatchProcessor()
    total_player_stats = 0
    try:
        for day in iter_days(start, end):
            dstr = day.date().isoformat()
            logger.info(f'[day] {dstr} fetching scheduled/live snapshot')
            # We approximate by calling scheduled-events/{date}
            fl = FetchLoop()
            fl.browser = browser
            sched = fl._safe_fetch(f'scheduled-events/{dstr}') or {}
            events = []
            if 'events' in sched:
                events = sched.get('events') or []
            elif isinstance(sched, list):
                events = sched
            if not events:
                logger.info(f'[day] {dstr} no events')
                continue
            enriched: List[Dict[str, Any]] = []
            for ev in events:
                try:
                    eid = fl._extract_event_id(ev)
                    if not eid:
                        continue
                    detail = fl._safe_fetch(f'event/{eid}') or {}
                    base = detail.get('event') if isinstance(detail, dict) and isinstance(detail.get('event'), dict) else detail or ev
                    row = {'event': base, 'event_id': eid}
                    lu = fl._safe_fetch(f'event/{eid}/lineups') or {}
                    if lu:
                        row['lineups'] = fl._parse_lineups(lu)
                        row['homeFormation'] = fl._extract_formation(lu, 'home')
                        row['awayFormation'] = fl._extract_formation(lu, 'away')
                        row['home_team_sofa'] = fl._extract_team_id(lu, 'home')
                        row['away_team_sofa'] = fl._extract_team_id(lu, 'away')
                    inc = fl._safe_fetch(f'event/{eid}/incidents') or {}
                    if inc:
                        row['events'] = fl._parse_incidents(inc)
                    st = fl._safe_fetch(f'event/{eid}/statistics') or {}
                    if st:
                        row['_raw_statistics'] = st
                    enriched.append(row)
                except Exception as ex:
                    logger.warning(f'[enrich][skip] eid={ev.get("id")} err={ex}')
            if not enriched:
                continue
            bundle = mp.process(enriched)
            # Add processed team/match stats
            all_player_stats = []
            for ee in enriched:
                eid = ee.get('event_id')
                if ee.get('_raw_player_stats'):
                    all_player_stats.extend(stats_processor.process_player_stats(ee['_raw_player_stats'], eid))
                else:
                    fb = build_player_stats_fallback(ee)
                    if fb:
                        all_player_stats.extend(fb)
            if not all_player_stats:
                logger.info(f'[day] {dstr} no player_stats built')
                continue
            # Map and store minimal dependencies (players, matches done via existing upsert path)
            bundle['player_stats'] = all_player_stats
            if args.dry_run:
                logger.info(f'[DRY][day] {dstr} player_stats={len(all_player_stats)}')
                total_player_stats += len(all_player_stats)
                continue
            # Store via database directly (reuse storage phase logic subset)
            # We'll imitate fetch_loop storage for player_stats dependencies
            from core.database import db as _db
            # Upsert teams/players/matches first to satisfy FKs
            if bundle.get('teams'):
                _db.upsert_teams(bundle['teams'])
            if bundle.get('players'):
                _db.upsert_players(bundle['players'])
            if bundle.get('matches'):
                _db.batch_upsert_matches(bundle['matches'])
            # Build maps
            match_map = _db.get_match_ids_by_source_ids([(m['source'], m['source_event_id']) for m in bundle.get('matches', []) if m.get('source') and m.get('source_event_id')]) if bundle.get('matches') else {}
            player_map = _db.get_player_ids_by_sofa([p['sofascore_id'] for p in bundle.get('players', [])]) if bundle.get('players') else {}
            team_map = _db.get_team_ids_by_sofa([t['sofascore_id'] for t in bundle.get('teams', [])]) if bundle.get('teams') else {}
            for r in all_player_stats:
                tup = (r.get('source'), r.get('source_event_id'))
                if tup in match_map:
                    r['match_id'] = match_map[tup]
                if (ps := r.get('player_sofascore_id')) in player_map:
                    r['player_id'] = player_map[ps]
                if (ts := r.get('team_sofascore_id')) in team_map:
                    r['team_id'] = team_map[ts]
            ok, fail = _db.upsert_player_stats(all_player_stats)
            total_player_stats += ok
            logger.info(f'[saved][day] {dstr} player_stats ok={ok} fail={fail}')
        logger.info(f'[backfill][done] total_player_stats={total_player_stats}')
    finally:
        try:
            browser.close()
        except Exception:
            pass

if __name__ == '__main__':
    main()
