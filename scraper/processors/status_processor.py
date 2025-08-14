# scraper/processors/status_processor.py
from typing import Any, Dict, Optional
from datetime import datetime, timezone, timedelta

ALLOWED_DB_STATUSES = {"live", "ht", "finished", "ft", "upcoming", "postponed", "canceled", "abandoned"}

# Mapiranje SofaScore status.type (string) -> naš status
TYPE_STR_MAP = {
    "inprogress": "live",
    "in_progress": "live",
    "halftime": "ht",
    "finished": "finished",
    "ft": "finished",
    "notstarted": "upcoming",
    "postponed": "postponed",
    "cancelled": "canceled",
    "canceled": "canceled",
    "abandoned": "abandoned",
    # izvan DB-sheme -> premapiraj na dopušteno
    "suspended": "postponed",
}

# Mapiranje SofaScore status.code (int) -> naš status
CODE_INT_MAP = {
    0: "upcoming",   # not started
    1: "live",       # 1st half / in progress
    2: "ht",         # halftime
    3: "live",       # 2nd half
    6: "live",       # extra time
    7: "live",       # penalties / playing
    60: "postponed",
    70: "canceled",
    100: "finished",
    120: "finished", # after ET
}

def map_status(raw_status: Dict[str, Any]) -> str:
    if not isinstance(raw_status, dict):
        return "upcoming"

    st_type = raw_status.get("type")
    st_code = raw_status.get("code")

    if isinstance(st_type, str):
        val = TYPE_STR_MAP.get(st_type.lower())
        if val:
            return val

    if isinstance(st_code, int):
        val = CODE_INT_MAP.get(st_code)
        if val:
            return val

    desc = str(raw_status.get("description", "")).lower()
    if "ht" in desc or "half-time" in desc:
        return "ht"
    if "ft" in desc or "full-time" in desc:
        return "finished"

    return "upcoming"

def clamp_to_db(status: str) -> str:
    s = (status or "").lower()
    if s in ALLOWED_DB_STATUSES:
        return s
    if s in {"suspended"}:
        return "postponed"
    return "upcoming"

def coerce_status_with_time(status: str,
                            start_time_iso: Optional[str],
                            now: Optional[datetime] = None,
                            grace_before_min: int = 10,
                            force_finish_after_h: int = 3) -> str:
    """
    Blagi vremenski guard:
    - upcoming/scheduled malo prije ili malo poslije starta ostaje 'upcoming' (frontend ga ionako skriva ako je prošao).
    - live/ht stariji od force_finish_after_h -> 'finished'
    - upcoming stariji od force_finish_after_h -> 'finished' (fallback; glavno čišćenje radimo u DB-u)
    """
    base = clamp_to_db(status)
    if not start_time_iso:
        return base

    now = now or datetime.now(timezone.utc)
    try:
        st = datetime.fromisoformat(start_time_iso.replace("Z", "+00:00"))
    except Exception:
        return base

    if base in {"live", "ht"} and now - st > timedelta(hours=force_finish_after_h):
        return "finished"

    if base in {"upcoming"}:
        # ako je daleko prešlo vrijeme početka, pro-glasi finished (fallback)
        if now - st > timedelta(hours=force_finish_after_h):
            return "finished"
        # u suprotnom, ostavi 'upcoming' (frontend ima stricter filter po vremenu)
        return "upcoming"

    return base
