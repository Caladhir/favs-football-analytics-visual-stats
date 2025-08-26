"""Utility: Detect matches where stored final/current scores appear +1 inflated vs counted goal events and patch them.

Logic:
 1. Select finished matches for a provided date range (or all if no date).
 2. For each match, count goal/own_goal events in match_events.
 3. If both stored home_score == goals_home + 1 AND away_score == goals_away + 1 -> patch to exact counts.
 4. Update matches table (home_score, away_score, final_home_score, final_away_score) and insert a corrective snapshot row in match_state.

Usage:
  python -m scraper.tools.patch_scores --since 2025-08-01
  python -m scraper.tools.patch_scores --match 14025088
"""

from __future__ import annotations
import argparse, sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent))
from core.database import db  # type: ignore
from utils.logger import get_logger

logger = get_logger(__name__)

def fetch_finished_matches(since: str | None, match_id: int | None):
    q = db.client.table("matches").select("id,source_event_id,source,home_score,away_score,final_home_score,final_away_score,start_time")
    q = q.eq("status","ft")
    if match_id:
        q = q.eq("source_event_id", match_id)
    if since:
        q = q.gte("start_time", since)
    res = q.limit(2000).execute()
    return res.data or []

def count_goals(match_uuid: str):
    # Count goals from events table (linked by match_id)
    er = db.client.table("match_events").select("team,event_type").eq("match_id", match_uuid).in_("event_type", ["goal","own_goal"]).limit(1000).execute()
    gh = sum(1 for r in (er.data or []) if r.get("team") == "home")
    ga = sum(1 for r in (er.data or []) if r.get("team") == "away")
    return gh, ga

def patch():
    ap = argparse.ArgumentParser()
    ap.add_argument("--since", help="ISO date lower bound (YYYY-MM-DD)")
    ap.add_argument("--match", type=int, help="Specific source_event_id to patch", default=None)
    args = ap.parse_args()
    rows = fetch_finished_matches(args.since, args.match)
    if not rows:
        print("No finished matches found for criteria")
        return
    patched = 0
    examined = 0
    for m in rows:
        examined += 1
        mid = m.get("id")
        if not mid:
            continue
        gh, ga = count_goals(mid)
        hs = m.get("final_home_score") or m.get("home_score")
        as_ = m.get("final_away_score") or m.get("away_score")
        if hs == gh + 1 and as_ == ga + 1:
            logger.info(f"[patch_scores] anomaly detected match_id={mid} ev={m.get('source_event_id')} stored={hs}-{as_} goals={gh}-{ga} -> patching")
            # Perform update
            try:
                db.client.table("matches").update({
                    "home_score": gh, "away_score": ga,
                    "final_home_score": gh, "final_away_score": ga,
                }).eq("id", mid).execute()
                # Insert corrective snapshot
                db.client.table("match_state").upsert({
                    "match_id": mid,
                    "status": "ft",
                    "status_type": "ft",
                    "minute": 90,
                    "home_score": gh,
                    "away_score": ga,
                    "updated_at": datetime.utcnow().replace(tzinfo=timezone.utc).isoformat(),
                }).execute()
                patched += 1
            except Exception as ex:
                logger.warning(f"[patch_scores] failed to patch match_id={mid} err={ex}")
    print(f"Examined={examined} patched={patched}")

if __name__ == "__main__":
    patch()
