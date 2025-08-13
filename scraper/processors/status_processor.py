# scraper/processors/status_processor.py
from typing import Any, Dict, Optional

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
    # izvan DB-shemea -> premapiraj na dopušteno
    "suspended": "postponed",
}

# Mapiranje SofaScore status.code (int) -> naš status (minimalno što trebamo)
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
    """
    raw_status primjer:
      { 'type': 'inprogress', 'code': 6, 'description': '...' }
      ili { 'type': 100, 'description': 'finished' } ovisno o endpointu
    """
    if not isinstance(raw_status, dict):
        return "upcoming"

    st_type = raw_status.get("type")
    st_code = raw_status.get("code")

    # 1) string `type`
    if isinstance(st_type, str):
        val = TYPE_STR_MAP.get(st_type.lower())
        if val:
            return val

    # 2) numeric `code`
    if isinstance(st_code, int):
        val = CODE_INT_MAP.get(st_code)
        if val:
            return val

    # 3) fallback: ako postoji description s HT/FT (SofaScore javno objašnjava HT/FT) 
    # https://sofascore.helpscoutdocs.com/article/49-match-statuses-explained
    desc = str(raw_status.get("description", "")).lower()
    if "ht" in desc or "half-time" in desc:
        return "ht"
    if "ft" in desc or "full-time" in desc:
        return "finished"

    return "upcoming"

def clamp_to_db(status: str) -> str:
    """Garantiraj da je status jedan od dopuštenih u DB CHECK constraintu."""
    s = (status or "").lower()
    if s in ALLOWED_DB_STATUSES:
        return s
    # Fallbackovi (suspendirano/varijante) u dopuštene:
    if s in {"suspended"}:
        return "postponed"
    return "upcoming"
