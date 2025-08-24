from __future__ import annotations
from datetime import datetime
import time
from typing import Any, Dict, List
from utils.logger import get_logger

logger = get_logger(__name__)

def fetch_day(browser: Any, day: datetime, throttle: float = 0.0) -> List[Dict[str, Any]]:
    date_str = day.strftime("%Y-%m-%d")
    endpoint = f"scheduled-events/{date_str}"
    try:
        data = browser.fetch_data(endpoint) or {}
        if throttle > 0:
            time.sleep(throttle)
        events = data.get("events") or data.get("matches") or []
        logger.info(f"[fetch_day] {len(events)} events {date_str}")
        return events
    except Exception as e:
        logger.error(f"[fetch_day] fail {date_str}: {e}")
        return []
