# scraper/tools/get_match.py - Inspect a single match by source_event_id
import sys
from pathlib import Path
from datetime import datetime

sys.path.append(str(Path(__file__).parent.parent))

from core.database import db


def get_match(event_id: int):
    res = (
        db.client
        .table("matches")
        .select("id,home_team,away_team,start_time,status,home_score,away_score,competition,round,season,source,source_event_id")
        .eq("source", "sofascore")
        .eq("source_event_id", event_id)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    if not rows:
        print("No match found")
        return
    m = rows[0]
    print({k: m.get(k) for k in [
        "id","home_team","away_team","start_time","status","home_score","away_score","competition","round","season","source","source_event_id"
    ]})


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python scraper/tools/get_match.py <event_id>")
        sys.exit(1)
    get_match(int(sys.argv[1]))
