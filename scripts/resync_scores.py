#!/usr/bin/env python3
"""
Resync (patch) stored match scores with authoritative provider scoreboard (homeScore.current / awayScore.current)
for a given UTC date range. Only updates when provider differs from stored DB values.

Usage (PowerShell examples):
  python scripts/resync_scores.py --from 2025-09-15 --to 2025-09-15
  python scripts/resync_scores.py --days-back 1          # yesterday only
  python scripts/resync_scores.py --match 1234567        # single provider event id

Requirements:
  - SUPABASE_URL / SUPABASE_SERVICE_KEY env vars (already used elsewhere in project)
  - Internet access to provider API endpoints (SofaScore-like: https://www.sofascore.com/api/v1/event/{id})

Safety:
  - Only PATCHES (update) rows where (source='sofascore' AND source_event_id=provider_id) AND score differs
  - Keeps final_* fields coherent for finished matches
  - Dry run mode available: add --dry-run to see planned changes

Exit code 0 on success (even if nothing changed). Non-zero on unexpected exception.
"""

from __future__ import annotations
import os, sys, argparse, datetime, json, time
from typing import List, Dict, Any, Optional, Tuple, Iterable
import urllib.request
import urllib.error

# Reuse existing config loader (env vars)
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(SCRIPT_DIR)

# Ensure both project root and scraper package path are importable
for p in {ROOT_DIR, os.path.join(ROOT_DIR, "scraper"), os.path.join(ROOT_DIR, "scraper", "core")}:
    if p not in sys.path:
        sys.path.append(p)

try:
    from scraper.core.config import config  # type: ignore
    from scraper.core.database import db    # type: ignore
except Exception as e:
    # More diagnostic detail – list sys.path for quick debugging
    print(f"[resync_scores] import failure: {e}\n  sys.path=\n    " + "\n    ".join(sys.path), file=sys.stderr)
    sys.exit(2)

PROVIDER_BASE = "https://www.sofascore.com/api/v1"  # adjust if needed

HEADERS = {
    "User-Agent": "Mozilla/5.0 (resync-script)",
    "Accept": "application/json",
}

def fetch_event(ev_id: int) -> Optional[Dict[str, Any]]:
    url = f"{PROVIDER_BASE}/event/{ev_id}"
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=15) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            data = json.loads(raw)
            if isinstance(data, dict):
                return data.get("event") if isinstance(data.get("event"), dict) else data
    except urllib.error.HTTPError as he:
        print(f"[provider] HTTP {he.code} ev={ev_id}")
    except Exception as e:
        print(f"[provider] error ev={ev_id}: {e}")
    return None

def iso_day_bounds(d: datetime.date) -> Tuple[str, str]:
    start = datetime.datetime(d.year, d.month, d.day, 0, 0, 0, tzinfo=datetime.timezone.utc)
    end = start + datetime.timedelta(days=1)
    return start.isoformat(), end.isoformat()

def select_matches_by_day_range(client, start_day: datetime.date, end_day: datetime.date) -> List[Dict[str, Any]]:
    # inclusive date loop
    out: List[Dict[str, Any]] = []
    day = start_day
    while day <= end_day:
        lo, hi = iso_day_bounds(day)
        try:
            # Filtering by start_time range
            q = (client.table("matches")
                 .select("id,source,source_event_id,home_score,away_score,status,start_time")
                 .gte("start_time", lo).lt("start_time", hi))
            # Only provider-sourced (source=sofascore)
            q = q.eq("source", "sofascore")
            res = q.execute()
            rows = res.data or []
            out.extend(rows)
            print(f"[query] {day} rows={len(rows)}")
        except Exception as e:
            print(f"[query] failed {day}: {e}")
        day += datetime.timedelta(days=1)
    return out

def select_matches_by_event_ids(client, ids: List[int]) -> List[Dict[str, Any]]:
    if not ids:
        return []
    rows: List[Dict[str, Any]] = []
    # Supabase 'in' limit -> chunk
    CHUNK = 100
    for i in range(0, len(ids), CHUNK):
        chunk = ids[i:i+CHUNK]
        try:
            res = (client.table("matches")
                   .select("id,source,source_event_id,home_score,away_score,status,start_time")
                   .eq("source", "sofascore")
                   .in_("source_event_id", chunk)
                   .execute())
            rows.extend(res.data or [])
        except Exception as e:
            print(f"[query] failed chunk {chunk}: {e}")
    return rows

def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(description="Patch stored scores from provider current values")
    g = ap.add_mutually_exclusive_group(required=False)
    g.add_argument("--days-back", type=int, help="Number of days back from today UTC (inclusive) to resync")
    g.add_argument("--from", dest="date_from", help="Start date (UTC) YYYY-MM-DD")
    ap.add_argument("--to", dest="date_to", help="End date (UTC) YYYY-MM-DD (inclusive) – defaults to --from if omitted")
    ap.add_argument("--match", action="append", dest="match_ids", type=int, help="Specific provider event id (repeatable)")
    ap.add_argument("--dry-run", action="store_true", help="Show planned updates without performing them")
    ap.add_argument("--limit", type=int, help="Limit number of matches processed (debug)")
    return ap.parse_args()

def main():
    args = parse_args()
    if not config.SUPABASE_URL or not config.SUPABASE_SERVICE_KEY:
        print("Missing SUPABASE env vars", file=sys.stderr)
        return 2

    client = db.client

    target_matches: List[Dict[str, Any]] = []
    today_utc = datetime.datetime.utcnow().date()

    if args.match_ids:
        target_matches = select_matches_by_event_ids(client, args.match_ids)
    else:
        if args.days_back is not None:
            start = today_utc - datetime.timedelta(days=args.days_back)
            end = start
        else:
            if args.date_from:
                try:
                    start = datetime.datetime.strptime(args.date_from, "%Y-%m-%d").date()
                except ValueError:
                    print("Invalid --from date format")
                    return 2
            else:
                # default: yesterday
                start = today_utc - datetime.timedelta(days=1)
            if args.date_to:
                try:
                    end = datetime.datetime.strptime(args.date_to, "%Y-%m-%d").date()
                except ValueError:
                    print("Invalid --to date format")
                    return 2
            else:
                end = start
        target_matches = select_matches_by_day_range(client, start, end)

    if args.limit:
        target_matches = target_matches[:args.limit]

    print(f"[resync] candidate matches: {len(target_matches)}")
    if not target_matches:
        return 0

    patched = 0
    skipped_same = 0
    failed = 0
    start_ts = time.time()

    for m in target_matches:
        sid = m.get("source_event_id")
        if not isinstance(sid, int):
            continue
        ev = fetch_event(sid)
        if not ev:
            failed += 1
            continue
        hs = (ev.get("homeScore") or {}).get("current")
        as_ = (ev.get("awayScore") or {}).get("current")
        # Note: we no longer store separate final_* columns; finished detection kept only for logging if needed
        try:
            st = (ev.get("status") or {}).get("type") or (ev.get("status") or {}).get("description")
        except Exception:
            st = None

        if hs is None or as_ is None:
            # Nothing authoritative – skip
            skipped_same += 1
            continue
        cur_h = m.get("home_score")
        cur_a = m.get("away_score")
        if cur_h == hs and cur_a == as_:
            skipped_same += 1
            continue

        update_payload = {
            "home_score": hs,
            "away_score": as_,
            "updated_at": datetime.datetime.utcnow().replace(tzinfo=datetime.timezone.utc).isoformat(),
        }

        print(f"[update] ev={sid} {cur_h}-{cur_a} -> {hs}-{as_}")
        if not args.dry_run:
            try:
                (client.table("matches")
                 .update(update_payload)
                 .eq("source", "sofascore")
                 .eq("source_event_id", sid)
                 .execute())
                patched += 1
            except Exception as e:
                failed += 1
                print(f"[update][fail] ev={sid}: {e}")

    dur = time.time() - start_ts
    print(f"[resync][done] patched={patched} unchanged={skipped_same} failed={failed} elapsed={dur:.1f}s")
    return 0 if failed == 0 else 1

if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("Interrupted")
        sys.exit(130)
