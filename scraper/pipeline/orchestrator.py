from __future__ import annotations
from typing import List, Dict, Any
from utils.logger import get_logger
from .fetchers import fetch_day
from .enrichers import enrich_event
from .store import store_bundle
from .standings import build_standings
from processors import MatchProcessor

logger = get_logger(__name__)


def run_day(browser, day: str, throttle: float = 0.0) -> Dict[str, Any]:
    """High-level orchestration: fetch scheduled events for a day, enrich, process, store."""
    events = fetch_day(browser, day, throttle=throttle)
    logger.info(f"[orchestrator] fetched {len(events)} base events for {day}")
    enriched: List[Dict[str, Any]] = []
    for ev in events:
        try:
            enriched.append(enrich_event(browser, ev, throttle=throttle))
        except Exception as ex:
            logger.warning(f"[orchestrator] enrich failed event_id={ev.get('id')}: {ex}")
    bundle = MatchProcessor().process(enriched)
    # Attach standings (once per competition/season combo in enriched set)
    try:
        std_rows = build_standings(browser, enriched, throttle=throttle)
        if std_rows:
            bundle["standings"] = std_rows
    except Exception as e:
        logger.debug(f"[orchestrator] standings build failed: {e}")
    counts = store_bundle(bundle, browser=browser, throttle=throttle)
    logger.info(f"[orchestrator] stored: {counts}")
    return {"fetched": len(events), "enriched": len(enriched), "stored": counts}
