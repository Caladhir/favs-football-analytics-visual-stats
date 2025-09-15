"""Retrofix script (LEGACY-SCHEMA FRIENDLY) to normalize historical match start_time values.

THIS VERSION works with your current DB schema where table `matches` DOES NOT yet
contain helper columns like scheduled_start_ts, kickoff_offset_min, start_time_source, start_time_prev.

Strategy (legacy mode):
    1. Pull minimal fields: id, start_time, source, source_event_id
    2. For each row having source='sofascore' and source_event_id, fetch canonical
         SofaScore event JSON (startTimestamp).
    3. Compute diff_minutes = stored_start_time - provider_start_time.
    4. Mark as anomaly if:
                |diff_minutes| in {45,60,75,90,105,120}  OR  |diff_minutes| >= min_diff (default 45) and <= max_diff (150)
    5. Prepare updates: set start_time = canonical provider timestamp (UTC ISO) ONLY.
         (No extra columns touched because they don't exist yet.)
    6. Dry-run by default; need --apply to write.

If provider API call fails for an event we skip it (safe). Optional pattern based correction (--pattern-fallback)
can adjust common +60 / +120 min drifts even if API unreachable (disabled by default).

Examples:
    python scripts/retrofix_start_times.py                # dry-run
    python scripts/retrofix_start_times.py --min-diff 30  # broader scan
    python scripts/retrofix_start_times.py --apply        # apply fixes
    python scripts/retrofix_start_times.py --apply --pattern-fallback

Environment:
    SUPABASE_URL + SUPABASE_SERVICE_KEY (or ANON) OR auto-load via scraper.core.config.Config
    SOFA_API_BASE (optional) defaults to https://api.sofascore.com/api/v1

Safeguards:
    - Won't apply without --apply
    - Limits via --limit
    - Skips rows where canonical < 2005 or > (now + 400d) (sanity)

Outputs a CSV audit file retrofix_audit.csv (append) with: id,source_event_id,old_iso,new_iso,diff_min,mode
"""
from __future__ import annotations
import os, sys, math, time, argparse, datetime as dt, csv
import requests
from typing import List, Dict, Any

# ------------------------------------------------------------------
# Environment bootstrap: load .env.local then import Config fallback
# ------------------------------------------------------------------
try:
    from dotenv import load_dotenv  # type: ignore
    # ascend to repo root (script is in scripts/)
    ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    env_local = os.path.join(ROOT, '.env.local')
    if os.path.exists(env_local):
        load_dotenv(env_local)
except Exception:
    pass

SUPABASE_URL = os.getenv("SUPABASE_URL")
SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_ANON_KEY")
if (not SUPABASE_URL or not SERVICE_KEY):
    # Try scraper core Config class (already loads .env.local on import)
    try:
        sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
        from scraper.core.config import Config  # type: ignore
        SUPABASE_URL = SUPABASE_URL or Config.SUPABASE_URL
        SERVICE_KEY = SERVICE_KEY or Config.SUPABASE_SERVICE_KEY
    except Exception:
        pass

TABLE = "matches"

PAGE_SIZE = 500
ANOMALY_SET = {45, 60, 75, 90, 105, 120}
DEFAULT_MIN_DIFF = 45
MAX_DIFF = 150

ISO_FMT = "%Y-%m-%dT%H:%M:%S+00:00"

def iso_from_epoch(sec: int) -> str:
    return dt.datetime.utcfromtimestamp(sec).strftime(ISO_FMT)

def parse_iso_to_epoch(iso_str: str) -> int | None:
    if not iso_str:
        return None
    try:
        if iso_str.endswith("Z"):
            iso_str = iso_str.replace("Z", "+00:00")
        return int(dt.datetime.fromisoformat(iso_str).timestamp())
    except Exception:
        return None


def fetch_all() -> List[Dict[str, Any]]:
    headers = {"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"}
    rows: List[Dict[str, Any]] = []
    offset = 0
    select = "id,start_time,source,source_event_id"
    while True:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/{TABLE}",
            params={"select": select, "limit": PAGE_SIZE, "offset": offset},
            headers=headers,
            timeout=30,
        )
        if r.status_code != 200:
            print("Fetch error", r.status_code, r.text)
            break
        batch = r.json()
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
        time.sleep(0.15)
    print(f"Using legacy select columns: {select}")
    return rows


def fetch_canonical_start(event_id: int) -> int | None:
    base = os.getenv("SOFA_API_BASE", "https://api.sofascore.com/api/v1")
    url = f"{base}/event/{event_id}"
    try:
        r = requests.get(url, timeout=8, headers={"User-Agent": "favs-retrofix/1.0"})
        if r.status_code != 200:
            return None
        data = r.json().get("event") or {}
        ts = data.get("startTimestamp")
        if isinstance(ts, (int, float)):
            return int(ts)
        if isinstance(ts, str) and ts.isdigit():
            return int(ts)
    except Exception:
        return None
    return None

def detect_candidates(rows: List[Dict[str, Any]], min_diff: int, pattern_fallback: bool) -> List[Dict[str, Any]]:
    now_plus = int(time.time()) + 400*24*3600
    year2005 = int(dt.datetime(2005,1,1, tzinfo=dt.timezone.utc).timestamp())
    cands = []
    total = len(rows)
    for idx, r in enumerate(rows, 1):
        st_iso = r.get("start_time")
        if not st_iso:
            continue
        st_epoch = parse_iso_to_epoch(st_iso)
        if not st_epoch:
            continue
        if r.get("source") != "sofascore" or not r.get("source_event_id"):
            continue
        try:
            ev_id = int(r.get("source_event_id"))
        except Exception:
            continue
        ss_epoch = fetch_canonical_start(ev_id)
        mode = "api" if ss_epoch else None
        if not ss_epoch and pattern_fallback:
            # Attempt pattern correction: if stored time seems exactly X minutes off current wallclock alignment (rare). Skip unless +1h or +2h plausible.
            # We cannot reliably guess canonical time without provider, so we just skip in fallback for safety.
            continue
        if not ss_epoch:
            continue
        # sanity
        if not (year2005 < ss_epoch < now_plus):
            continue
        diff_min = int((st_epoch - ss_epoch)/60)
        adiff = abs(diff_min)
        if (adiff in ANOMALY_SET or (min_diff <= adiff <= MAX_DIFF)) and adiff >= min_diff:
            cands.append({
                "row": r,
                "diff_min": diff_min,
                "ss_epoch": ss_epoch,
                "st_epoch": st_epoch,
                "mode": mode,
            })
        if idx % 250 == 0:
            print(f"Scanned {idx}/{total}... candidates so far: {len(cands)}")
    return cands


def batch_update(updates: List[Dict[str, Any]], dry_run: bool):
    """Apply updates row-by-row via PATCH to avoid needing all NOT NULL columns.

    The previous implementation used a POST upsert which triggered attempts to INSERT
    (leading to NOT NULL violations on columns like home_team). PATCH with a filter
    updates only the provided column for existing rows.
    """
    if not updates:
        print("No updates to apply.")
        return
    if dry_run:
        print(f"[DRY-RUN] Would update {len(updates)} rows (showing up to 20):")
        for u in updates[:20]:
            print(u)
        remaining = len(updates) - 20
        if remaining > 0:
            print(f"... ({remaining} more)")
        return

    headers = {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
        # ask PostgREST to return minimal payload for speed
        "Prefer": "return=minimal"
    }
    success = 0
    failures = 0
    for idx, u in enumerate(updates, 1):
        mid = u['id']
        new_iso = u['start_time']
        url = f"{SUPABASE_URL}/rest/v1/{TABLE}?id=eq.{mid}"
        try:
            r = requests.patch(url, json={"start_time": new_iso}, headers=headers, timeout=20)
            if r.status_code in (200, 204):
                success += 1
            else:
                failures += 1
                print(f"Patch fail ({r.status_code}) id={mid} -> {r.text[:180]}")
        except Exception as e:
            failures += 1
            print(f"Patch exception id={mid}: {e}")
        if idx % 100 == 0:
            print(f"Progress: {idx}/{len(updates)} (ok={success}, fail={failures})")
            # light throttle
            time.sleep(0.3)
    print(f"Done. Applied {success} updates. Failures: {failures}.")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true', help='Actually apply updates (default dry-run)')
    parser.add_argument('--limit', type=int, default=0, help='Max number of rows to update (0 = no limit)')
    parser.add_argument('--min-diff', type=int, default=DEFAULT_MIN_DIFF, help='Minimum absolute minute diff (default 45)')
    parser.add_argument('--pattern-fallback', action='store_true', help='Enable limited pattern fallback if API fails (currently conservative)')
    parser.add_argument('--audit-file', default='retrofix_audit.csv', help='CSV file to append audit rows')
    args = parser.parse_args()

    if not SUPABASE_URL or not SERVICE_KEY:
        print("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY/ANON_KEY in env.")
        sys.exit(1)

    print("Fetching rows...")
    rows = fetch_all()
    print(f"Fetched {len(rows)} rows")
    if not rows:
        return

    cands = detect_candidates(rows, args.min_diff, args.pattern_fallback)
    print(f"Detected {len(cands)} anomalous candidates (min_diff={args.min_diff})")

    updates = []
    for c in cands:
        r = c['row']
        new_iso = iso_from_epoch(c['ss_epoch'])
        # Only send fields that EXIST in current schema (id, start_time, updated_at auto trigger)
        updates.append({
            'id': r.get('id'),
            'start_time': new_iso,
        })
    if args.limit and len(updates) > args.limit:
        updates = updates[:args.limit]
        print(f"Applying limit, truncated to {len(updates)} updates")

    # Write audit CSV always (dry-run included) for transparency
    if cands:
        write_header = not os.path.exists(args.audit_file)
        with open(args.audit_file, 'a', newline='', encoding='utf-8') as fh:
            w = csv.writer(fh)
            if write_header:
                w.writerow(['id','source_event_id','old_start_time','new_start_time','diff_min','mode'])
            for c in cands:
                r = c['row']
                w.writerow([
                    r.get('id'), r.get('source_event_id'), r.get('start_time'), iso_from_epoch(c['ss_epoch']), c['diff_min'], c.get('mode')
                ])
        print(f"Audit appended -> {args.audit_file}")

    batch_update(updates, dry_run=not args.apply)
    if not args.apply:
        print("(dry-run) Re-run with --apply to persist changes.")

if __name__ == '__main__':
    main()
