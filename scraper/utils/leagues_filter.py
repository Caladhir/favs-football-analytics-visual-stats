"""League / competition tracking helper.

Provides a higher-level should_track_competition() decision that combines:
  * Dynamic TOP N (rankings API) uniqueTournament ids (cached with TTL)
  * Explicit priority league names (taken from Config.LEAGUE_PRIORITIES)
  * Synonym / canonical name mapping (normalisation + diacritics stripping)

Intended as a complement / safety net to the stricter integer allow-list
resolved in core.config (SOFA_TOURNAMENTS_ALLOW). If that allow-list is
defined we still prefer it (fast membership test); this module helps catch
name based priority competitions whose IDs were not in the initial TOP N or
when operating without an env-provided allow list.
"""
from __future__ import annotations

from typing import Any, Dict, Set
import os
import time
import unicodedata

try:  # Optional – keep lightweight if requests not installed
    import requests  # type: ignore
except Exception:  # pragma: no cover
    requests = None  # type: ignore

from core.config import Config

# ---- Env configuration (support both legacy & new var names) -----------------

SOFA_RANKINGS_URL = os.getenv(
    "SOFA_RANKINGS_URL",
    "https://www.sofascore.com/api/v1/rankings/season/{season}/type/{rtype}"
)
SOFA_SEASON = int(os.getenv("SOFA_SEASON", os.getenv("RANKINGS_SEASON", "2026")))
SOFA_RTYPE = int(os.getenv("SOFA_RTYPE", os.getenv("RANKINGS_TYPE", "1")))
TOP_N = int(os.getenv("SOFA_TOPN", os.getenv("ALLOW_TOP_N", "50")))
SOFA_TIMEOUT = float(os.getenv("SOFA_TIMEOUT", "12.0"))

# ---- Normalisation helpers --------------------------------------------------

def _norm(txt: str) -> str:
    if not txt:
        return ""
    return unicodedata.normalize('NFKD', txt).encode('ascii', 'ignore').decode('ascii').strip().lower()


# ---- Synonyms / canonical name mapping --------------------------------------

NAME_SYNONYMS: Dict[str, str] = {
    # La Liga
    _norm("LaLiga"): "La Liga",
    # Netherlands
    _norm("VriendenLoterij Eredivisie"): "Eredivisie",
    # Portugal
    _norm("Liga Portugal Betclic"): "Primeira Liga",
    # Belgium
    _norm("Pro League"): "Belgian Pro League",
    _norm("Jupiler Pro League"): "Belgian Pro League",
    # Scotland
    _norm("Scottish Premiership"): "Scottish Premiership",
    # Austria
    _norm("Austrian Bundesliga"): "Austrian Bundesliga",
    # Switzerland
    _norm("Swiss Super League"): "Swiss Super League",
    # Denmark
    _norm("Danish Superliga"): "Danish Superliga",
    _norm("Superliga"): "Danish Superliga",
    # Norway
    _norm("Eliteserien"): "Norwegian Eliteserien",
    # Sweden
    _norm("Allsvenskan"): "Swedish Allsvenskan",
    # Croatia
    _norm("HNL"): "HNL",
    # Serbia
    _norm("Mozzart Bet Superliga"): "SuperLiga",
    _norm("Superliga Srbije"): "SuperLiga",
    _norm("Prva Liga Srbije"): "Prva Liga Srbije",
    # Romania
    _norm("Romanian Super Liga"): "Liga 1",
    _norm("Liga 1"): "Liga 1",
    _norm("Superliga"): "Liga 1",  # (RO context)
    # Bulgaria
    _norm("Parva Liga"): "Bulgarian First League",
    # England
    _norm("Premier League"): "Premier League",
    _norm("English Premier League"): "Premier League",
    _norm("EPL"): "Premier League",
    # Germany
    _norm("Bundesliga"): "Bundesliga",
    # France
    _norm("Ligue 1"): "Ligue 1",
    # Spain alt
    _norm("La Liga"): "La Liga",
    # Turkey (not in priorities but might appear in TOP 50)
    _norm("Trendyol Super Lig"): "Trendyol Super Lig",
}

_ALWAYS_INCLUDE_BY_NAME: Set[str] = {_norm(nm) for nm in Config.LEAGUE_PRIORITIES.keys()}

# ---- Rankings cache (ID + normalised names) --------------------------------
_cached_top_ids: Set[int] = set()
_cached_top_names_norm: Set[str] = set()
_cached_at: float = 0.0
_CACHE_TTL = 60 * 60 * 24  # 24h


def _fetch_top_rankings() -> None:
    """Populate cache with TOP_N rankings uniqueTournament ids + names.

    Silent failure (best-effort) – keeps previous cache if request fails.
    """
    global _cached_top_ids, _cached_top_names_norm, _cached_at
    url = SOFA_RANKINGS_URL.format(season=SOFA_SEASON, rtype=SOFA_RTYPE)
    try:
        if requests is None:
            return
        r = requests.get(url, timeout=SOFA_TIMEOUT, headers={
            "User-Agent": "Mozilla/5.0 (compatible; FavsBot/1.0)"
        })  # type: ignore
        r.raise_for_status()  # type: ignore
        data = r.json()  # type: ignore
        rankings = data.get("rankings", [])[:TOP_N]
        top_ids: Set[int] = set()
        top_names: Set[str] = set()
        for row in rankings:
            ut = row.get("uniqueTournament") or {}
            ut_id = ut.get("id")
            ut_name = ut.get("name") or ""
            if isinstance(ut_id, int):
                top_ids.add(ut_id)
            if ut_name:
                top_names.add(_norm(ut_name))
        _cached_top_ids = top_ids
        _cached_top_names_norm = top_names
        _cached_at = time.time()
    except Exception:
        # best-effort; keep stale cache
        pass


def _ensure_cache_fresh() -> None:
    if time.time() - _cached_at > _CACHE_TTL or not _cached_top_ids:
        _fetch_top_rankings()


def canonical_name(name: str) -> str:
    n = _norm(name)
    return NAME_SYNONYMS.get(n, name)


def should_track_competition(tournament: Dict[str, Any]) -> bool:
    """Return True if competition should be processed.

    Rule order:
      1) ID in current TOP_N rankings list
      2) Name match (normalised) in TOP_N rankings list (fallback when feed lacks id mapping)
      3) Name / slug canonicalised to any priority league name (Config.LEAGUE_PRIORITIES)
    """
    if not isinstance(tournament, dict):
        return False
    _ensure_cache_fresh()
    tid = tournament.get("id")
    tname = tournament.get("name") or ""
    tslug = tournament.get("slug") or ""
    # 1) direct ID
    if isinstance(tid, int) and tid in _cached_top_ids:
        return True
    # 2) name in rankings names
    if _norm(tname) in _cached_top_names_norm:
        return True
    # 3) priority names (canonicalised)
    cname = _norm(canonical_name(tname))
    cslug = _norm(canonical_name(tslug.replace('-', ' ')))
    if cname in _ALWAYS_INCLUDE_BY_NAME or cslug in _ALWAYS_INCLUDE_BY_NAME:
        return True
    return False


def should_track_match(match: Dict[str, Any]) -> bool:
    """High-level match filter tolerant of SofaScore nesting variants.

    SofaScore event JSON često ima strukturu:
        event.tournament.uniqueTournament.id
    dok ponekad koristimo flattenirano:
        event.tournament.id

    Stari kod je očekivao da je 'tournament' već objekt s .id. Ako je samo
    uniqueTournament unutra, vraćali smo False (ne prati se) i ti eventi su
    otpali. Ova verzija prvo pokušava uniqueTournament, zatim bazni tournament.
    """
    if not isinstance(match, dict):  # defensive
        return False
    tour = (match.get("tournament") or {}) if isinstance(match.get("tournament"), dict) else {}
    # Ako postoji ugniježđeni uniqueTournament, preuzmi njega kao primarni objekt
    if isinstance(tour.get("uniqueTournament"), dict) and tour.get("uniqueTournament", {}).get("id"):
        cand = dict(tour.get("uniqueTournament") or {})  # copy
        # Propagiraj name/slug ako su samo na parentu
        cand.setdefault("name", tour.get("name"))
        cand.setdefault("slug", tour.get("slug"))
        return should_track_competition(cand)
    # Inače pokušaj tournament sam ili fallback legacy keys
    t = tour or (match.get("league") or {}) or (match.get("competition") or {})
    return should_track_competition(t)


def get_tracked_top_ids_snapshot() -> Set[int]:
    _ensure_cache_fresh()
    return set(_cached_top_ids)


__all__ = [
    "should_track_competition",
    "should_track_match",
    "get_tracked_top_ids_snapshot",
    "canonical_name",
]
