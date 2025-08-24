from __future__ import annotations
from typing import Any, Dict, List, Tuple, Optional, Set
import time
from utils.logger import get_logger
from processors.standings_processor import StandingsProcessor

logger = get_logger(__name__)

# Reusable standings fetch logic extracted from legacy script.
# Provides two helpers:
#   fetch_competition_standings(browser, comp_sofa:int, season_id:int|None) -> (raw_payload, path_used)
#   build_standings(browser, enriched_events, throttle=0.0) -> List[raw rows ready for store (sofascore ids retained)]

_standings_negative_paths: Set[str] = set()  # cache of failing endpoint variants for current process
_neg_counts: Dict[Tuple[int,int], int] = {}  # (comp, season_id|0) -> failures count
_MAX_NEG_VARIANTS = 6

_VARIANTS_WITH_SEASON = [
    "tournament/{c}/season/{s}/standings/total",
    "unique-tournament/{c}/season/{s}/standings/total",
    "tournament/{c}/season/{s}/standings",
    "unique-tournament/{c}/season/{s}/standings",
    "tournament/{c}/season/{s}/standings/overall",
    "unique-tournament/{c}/season/{s}/standings/overall",
    "season/{s}/standings/total",
    "season/{s}/standings",
]
_VARIANTS_NO_SEASON = [
    "tournament/{c}/standings/total",
    "unique-tournament/{c}/standings/total",
    "tournament/{c}/standings",
    "unique-tournament/{c}/standings",
    "tournament/{c}/standings/overall",
    "unique-tournament/{c}/standings/overall",
]

def fetch_competition_standings(browser: Any, comp_sofa: int, season_id: Optional[int], throttle: float = 0.0) -> Tuple[Optional[Dict[str,Any]], Optional[str]]:
    key = (comp_sofa, season_id or 0)
    if _neg_counts.get(key, 0) >= _MAX_NEG_VARIANTS:
        logger.debug(f"[standings] abort cached-negative comp={comp_sofa} season_id={season_id}")
        return None, None
    variants: List[str] = []
    if season_id:
        variants.extend(v.format(c=comp_sofa, s=season_id) for v in _VARIANTS_WITH_SEASON)
    variants.extend(v.format(c=comp_sofa, s=season_id or 0) for v in _VARIANTS_NO_SEASON)
    used = None
    negatives_this_call = 0
    for path in variants:
        if path in _standings_negative_paths:
            continue
        try:
            data = browser.fetch_data(path) or None
            if throttle > 0:
                time.sleep(throttle)
            if not data:
                _standings_negative_paths.add(path); negatives_this_call += 1; continue
            if isinstance(data, dict) and data.get("__error__"):
                _standings_negative_paths.add(path); negatives_this_call += 1; continue
            if isinstance(data, dict) and not any(k in data for k in ("standings","overallStandings","tables","allStandings","rows","data","standingsData")):
                _standings_negative_paths.add(path); negatives_this_call += 1; continue
            used = path
            return data, used
        except Exception:
            _standings_negative_paths.add(path); negatives_this_call += 1; continue
        finally:
            if negatives_this_call and negatives_this_call % _MAX_NEG_VARIANTS == 0:
                _neg_counts[key] = _neg_counts.get(key, 0) + negatives_this_call
                if _neg_counts[key] >= _MAX_NEG_VARIANTS:
                    break
    if negatives_this_call:
        _neg_counts[key] = _neg_counts.get(key, 0) + negatives_this_call
    return None, used

_processor = StandingsProcessor()

def build_standings(browser: Any, enriched_events: List[Dict[str, Any]], throttle: float = 0.0) -> List[Dict[str, Any]]:
    """Derive (competition, season) pairs from enriched events, fetch standings once per pair, parse.
    Returns list of raw standings rows with sofascore identifiers (competition_sofascore_id, team_sofascore_id,...)
    """
    combos: Dict[Tuple[int,str], int] = {}  # (comp_sofa, season_name) -> season_id (maybe None)
    for enr in enriched_events:
        base = enr.get("event") or {}
        comp_obj = base.get("tournament") or base.get("competition") or {}
        comp_sofa = comp_obj.get("id") if isinstance(comp_obj, dict) else None
        season_obj = base.get("season") or {}
        season_name = season_obj.get("name") if isinstance(season_obj, dict) else None
        season_id = season_obj.get("id") if isinstance(season_obj, dict) else None
        if comp_sofa and season_name:
            combos.setdefault((int(comp_sofa), season_name), season_id)
    rows: List[Dict[str, Any]] = []
    for (comp_sofa, season_name), season_id in combos.items():
        raw, path = fetch_competition_standings(browser, comp_sofa, season_id, throttle=throttle)
        if not raw:
            logger.debug(f"[standings] no data comp={comp_sofa} season={season_name}")
            continue
        try:
            parsed = _processor.parse(raw, comp_sofa, season_name)
            rows.extend(parsed)
            logger.info(f"[standings] comp={comp_sofa} season={season_name} rows={len(parsed)} via={path}")
        except Exception as e:
            logger.debug(f"[standings] parse fail comp={comp_sofa} season={season_name}: {e}")
    return rows
