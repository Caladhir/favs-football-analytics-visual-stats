from __future__ import annotations
from typing import List, Dict, Any
from utils.logger import get_logger

logger = get_logger(__name__)

PLAYER_DETAIL_FIELDS = [
    ("nationality", lambda node: (node.get("country") or {}).get("name") if isinstance(node.get("country"), dict) else node.get("nationality")),
    ("height_cm", lambda node: node.get("height") or node.get("heightCm") or node.get("height_cm")),
    ("date_of_birth", lambda node: _extract_dob(node)),
]


def _extract_dob(node: Dict[str, Any]):
    dob = node.get("dateOfBirth") or node.get("birthDate")
    ts = node.get("dateOfBirthTimestamp") or node.get("birthDateTimestamp")
    if not dob and ts is not None:
        try:
            ts_int = int(ts)
            if ts_int > 10**12:  # ms -> s
                ts_int //= 1000
            from datetime import datetime, timezone, timedelta
            epoch = datetime(1970, 1, 1, tzinfo=timezone.utc)
            dob_dt = epoch + timedelta(seconds=ts_int)
            dob = dob_dt.date().isoformat()
        except Exception:
            dob = None
    return dob


def enrich_player_details(browser, players: List[Dict[str, Any]], throttle: float = 0.0):
    """Fill missing nationality/height/date_of_birth for players using player/{id} endpoint.

    Mutates player dicts in-place.
    """
    if not browser or not players:
        return
    seen: set[int] = set()
    enriched = 0
    for p in players:
        pid = p.get("sofascore_id") or p.get("id")
        if not pid:
            continue
        pid = int(pid)
        if pid in seen:
            continue
        # Missing if ANY target field missing (nationality OR height_cm OR date_of_birth)
        missing = any(p.get(f) in (None, "") for f, _ in PLAYER_DETAIL_FIELDS)
        if not missing:
            continue
        seen.add(pid)
        try:
            detail = browser.fetch_data(f"player/{pid}") or {}
        except Exception as ex:
            logger.debug(f"[players][detail_fail] id={pid} err={ex}")
            continue
        if not isinstance(detail, dict):
            continue
        node = detail.get("player") if isinstance(detail.get("player"), dict) else detail
        if not isinstance(node, dict):
            continue
        changed = False
        for field, getter in PLAYER_DETAIL_FIELDS:
            if p.get(field) in (None, ""):
                try:
                    val = getter(node)
                except Exception:
                    val = None
                if val:
                    p[field] = val
                    changed = True
        # Secondary fallback: if i dalje nema date_of_birth ali postoji dateOfBirthTimestamp u detail node
        if not p.get("date_of_birth"):
            ts_raw = node.get("dateOfBirthTimestamp") or node.get("birthDateTimestamp")
            if ts_raw:
                try:
                    ts_int = int(ts_raw)
                    if ts_int > 10**12:
                        ts_int //= 1000
                    from datetime import datetime, timezone as _tz
                    p["date_of_birth"] = datetime.utcfromtimestamp(ts_int).replace(tzinfo=_tz.utc).date().isoformat()
                    changed = True
                except Exception:
                    pass
        if changed:
            enriched += 1
        if throttle:
            import time as _t; _t.sleep(throttle)
    # Coverage log (analogno managers)
    try:
        total = len(players)
        nat_cov = sum(1 for x in players if x.get("nationality"))
        dob_cov = sum(1 for x in players if x.get("date_of_birth"))
        logger.info(f"[players][enrich_coverage] total={total} nationality={nat_cov}/{total} dob={dob_cov}/{total} enriched={enriched}")
    except Exception:
        pass
    if enriched:
        logger.info(f"[players] enriched detail count={enriched}")
