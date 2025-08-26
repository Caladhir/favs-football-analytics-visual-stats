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

# Debounce cache: (utid, season_name) -> last_fetch_epoch
_LAST_FETCH: Dict[Tuple[int,str], float] = {}
_MIN_INTERVAL = float(__import__('os').getenv('STANDINGS_MIN_INTERVAL_SECONDS', '180'))  # 3 minute default

def build_standings(browser: Any, enriched_events: List[Dict[str, Any]], throttle: float = 0.0) -> List[Dict[str, Any]]:
    """Derive (uniqueTournament, season) pairs from events and fetch standings once per pair.

    Rationale: elsewhere (competitions table) primarni ključ koristimo unique tournament ID (stabilan kroz sezone).
    Prethodna verzija je koristila season-specific tournament.id što je znalo uzrokovati mismatch pri mapiranju
    standings -> competitions (competition_sofascore_id nije postojao jer je competitions držao unique id).

    Ovdje:
      * Primarni key za combo = uniqueTournament.id (utid). Ako nedostaje, fallback na tournament.id.
      * Čuvamo i season_tournament_id (tid) radi dijagnostike.
      * U fetch pokušajima koristimo utid kao 'comp_sofa' – varijante već pokrivaju i unique-tournament/{c}.* pa će raditi.
    """
    combos: Dict[Tuple[int,str], Dict[str, Optional[int]]] = {}
    for enr in enriched_events:
        base = enr.get("event") or {}
        comp_obj = base.get("tournament") or base.get("competition") or {}
        if not isinstance(comp_obj, dict):
            continue
        tid_season = comp_obj.get("id")
        ut_obj = comp_obj.get("uniqueTournament") if isinstance(comp_obj.get("uniqueTournament"), dict) else {}
        utid = ut_obj.get("id") if isinstance(ut_obj, dict) else None
        primary_id = utid or tid_season
        if not primary_id:
            continue
        season_obj = base.get("season") or {}
        season_name = season_obj.get("name") if isinstance(season_obj, dict) else None
        season_id = season_obj.get("id") if isinstance(season_obj, dict) else None
        if primary_id and not season_name and season_id:
            season_name = str(season_id)
        if primary_id and season_name:
            key = (int(primary_id), str(season_name))
            combos.setdefault(key, {"season_id": season_id, "utid": utid, "tid": tid_season})
    if not combos:
        logger.debug("[standings] no (uniqueTournament, season) combos derived – skip")
    rows: List[Dict[str, Any]] = []
    logger.debug(f"[standings] combos={len(combos)} sample={[ (k[0], v.get('tid')) for k,v in list(combos.items())[:5] ]}")
    # Determine finished events per competition (force refresh when a match just finished)
    finished_comp: Set[int] = set()
    try:
        for enr in enriched_events:
            base = enr.get("event") or {}
            st = (base.get("status") or {}).get("type") or (base.get("status") or {}).get("description")
            comp_obj = base.get("tournament") or base.get("competition") or {}
            ut_obj = comp_obj.get("uniqueTournament") if isinstance(comp_obj.get("uniqueTournament"), dict) else {}
            utid = (ut_obj.get("id") if isinstance(ut_obj, dict) else None) or comp_obj.get("id")
            if utid and st and str(st).lower() in {"finished","afteret","aft","ft"}:
                finished_comp.add(int(utid))
    except Exception:
        finished_comp = set()
    for (comp_utid, season_name), meta in combos.items():
        season_id = meta.get("season_id")
        key = (comp_utid, season_name)
        now = time.time()
        last = _LAST_FETCH.get(key, 0)
        age = now - last
        force = comp_utid in finished_comp
        if age < _MIN_INTERVAL and not force:
            logger.debug(f"[standings] debounce skip utid={comp_utid} season={season_name} age={int(age)}s < {_MIN_INTERVAL}s")
            continue
        raw, path = fetch_competition_standings(browser, comp_utid, season_id, throttle=throttle)
        if not raw:
            logger.debug(f"[standings] no data utid={comp_utid} tid={meta.get('tid')} season={season_name}")
            continue
        try:
            parsed = _processor.parse(raw, comp_utid, season_name)
            # Augment each row with original season tournament id if available (debug only – store layer can ignore)
            if meta.get("tid") and meta.get("tid") != comp_utid:
                for r in parsed:
                    r.setdefault("season_tournament_sofascore_id", meta.get("tid"))
            rows.extend(parsed)
            logger.info(f"[standings] utid={comp_utid} tid={meta.get('tid')} season={season_name} rows={len(parsed)} via={path}")
            _LAST_FETCH[key] = now
        except Exception as e:
            logger.debug(f"[standings] parse fail utid={comp_utid} tid={meta.get('tid')} season={season_name}: {e}")
    if rows:
        logger.debug(f"[standings] total_rows={len(rows)}")
    else:
        logger.debug("[standings] total_rows=0")
    return rows
