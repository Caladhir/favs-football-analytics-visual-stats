from __future__ import annotations
from typing import Any, Dict, List
import time
from datetime import datetime, timezone, timedelta
from utils.logger import get_logger

logger = get_logger(__name__)

def enrich_manager_details(browser: Any, managers: List[Dict[str, Any]], throttle: float = 0.0) -> None:
    """Mutates manager dicts adding nationality/date_of_birth if missing via manager/{id} (primary) or coach/{id}."""
    targets = [m for m in managers if m.get("sofascore_id") and not (m.get("nationality") and m.get("date_of_birth"))]
    seen: set[int] = set()
    for m in targets:
        mid = m.get("sofascore_id")
        if mid in seen:
            continue
        seen.add(mid)
        detail = None
        try:
            detail = browser.fetch_data(f"manager/{mid}") or {}
            if throttle > 0:
                time.sleep(throttle)
        except Exception as e:
            logger.debug(f"[manager_enrich] manager/{mid} fail {e}")
        if not detail:
            try:
                detail = browser.fetch_data(f"coach/{mid}") or {}
                if throttle > 0:
                    time.sleep(throttle)
            except Exception as e:
                logger.debug(f"[manager_enrich] coach/{mid} fail {e}")
        if not isinstance(detail, dict):
            continue
        node = None
        for key in ("manager", "coach"):
            if isinstance(detail.get(key), dict):
                node = detail[key]; break
        if node is None:
            node = detail if isinstance(detail, dict) else {}
        # nationality
        if not m.get("nationality"):
            ctry = node.get("country") or {}
            nat = None
            if isinstance(ctry, dict):
                nat = ctry.get("name") or ctry.get("alpha2") or ctry.get("alpha3")
            if not nat:
                nat = node.get("nationality")
            if nat:
                m["nationality"] = nat
        # date_of_birth
        if not m.get("date_of_birth"):
            dob = node.get("dateOfBirth") or node.get("birthDate")
            ts_raw = node.get("dateOfBirthTimestamp")
            if not dob and ts_raw is not None:
                try:
                    ts = int(ts_raw)
                    if ts > 10**12:
                        ts //= 1000
                    epoch = datetime(1970,1,1, tzinfo=timezone.utc)
                    dob_dt = epoch + timedelta(seconds=ts)
                    dob = dob_dt.date().isoformat()
                except Exception:
                    dob = None
            if dob:
                m["date_of_birth"] = dob
    logger.info(f"[manager_enrich] coverage nationality={sum(1 for x in managers if x.get('nationality'))}/{len(managers)} dob={sum(1 for x in managers if x.get('date_of_birth'))}/{len(managers)}")
