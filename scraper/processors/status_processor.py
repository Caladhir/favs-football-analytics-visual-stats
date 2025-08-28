# scraper/processors/status_processor.py
from __future__ import annotations
from typing import Any, Dict, Optional
from core.config import Config

# Map raw SofaScore status strings to a limited set accepted by our DB.
#
# Our `matches` table accepts only the following statuses:
#   'live', 'upcoming', 'finished', 'ht', 'ft',
#   'postponed', 'canceled', 'abandoned', 'suspended'.
#
# Incoming SofaScore values are normalised by lower‑casing and removing
# whitespace/underscores before lookup.  Any unrecognised status will
# default to 'upcoming'.
_STATUS_MAP = {k.replace("_", ""): v for k, v in Config.STATUS_MAPPING.items()}  # normalise keys once

def normalize_status(raw: Optional[str]) -> str:
    """Normalise an arbitrary status string to one of the allowed values.

    SofaScore uses a variety of status descriptors (e.g. "inProgress",
    "HT", "FT", etc.).  Our database accepts only a small set defined
    in the `_STATUS_MAP`.  Any unknown or missing status defaults to
    'upcoming'.
    """
    if not raw:
        return "upcoming"
    # Normalise by lower‑casing and removing spaces/underscores
    key = str(raw).lower().replace(" ", "").replace("_", "")
    return _STATUS_MAP.get(key, "upcoming")

def clamp_to_db(val: Optional[int], lo: int = 0, hi: int = 999) -> Optional[int]:
    if val is None:
        return None
    try:
        v = int(val)
        return max(lo, min(hi, v))
    except Exception:
        return None

class StatusProcessor:
    """Minimalist normalizacija statusa i rezultata."""
    def parse(self, event: Dict[str, Any]) -> Dict[str, Any]:
        s = event.get("status", {}) or {}
        # Prefer the machine readable 'type' (e.g. inprogress, finished, notstarted) over the human description
        # because descriptions like "1st half", "2nd half", "AET" are NOT in our normalised map and were causing
        # live matches to be mis-labelled as 'upcoming'. Fallback to description only if type missing.
        raw_type = s.get("type") or event.get("statusType")
        raw_desc = s.get("description")
        chosen = raw_type or raw_desc
        status = normalize_status(chosen)
        # Additional guard: if type indicates live but description caused fallback earlier, force 'live'
        try:
            if raw_type and normalize_status(raw_type) == 'live':
                status = 'live'
            # Half-time detection: description sometimes "HT" or "Half Time" while type still inprogress
            if raw_desc and str(raw_desc).lower().replace(' ', '') in {'halftime','ht'}:
                status = 'ht'
        except Exception:
            pass

        # Score modeli (SofaScore često ima {current, period1, period2} ...)
        def _score(side: str, key: str) -> Optional[int]:
            obj = event.get(f"{side}Score") or {}
            if isinstance(obj, dict):
                return obj.get(key)
            return None

        out = {
            "status": status,
            "home_score": clamp_to_db(_score("home", "current")),
            "away_score": clamp_to_db(_score("away", "current")),
            "home_score_ht": clamp_to_db(_score("home", "period1")),
            "away_score_ht": clamp_to_db(_score("away", "period1")),
        }
        return out

status_processor = StatusProcessor()
