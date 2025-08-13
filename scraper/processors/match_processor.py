# scraper/processors/match_processor.py
from __future__ import annotations

from typing import List, Dict, Any, Tuple, Optional
from datetime import datetime, timezone
from utils.logger import get_logger
from .status_processor import map_status, clamp_to_db

logger = get_logger(__name__)


# ---------------------------
# Helperi
# ---------------------------

def _safe_team_name(team: Any) -> str:
    if not isinstance(team, dict):
        return "Unknown"
    return str(
        team.get("name")
        or team.get("shortName")
        or team.get("slug")
        or "Unknown"
    )


def _extract_scores(event: Dict[str, Any]) -> Tuple[int, int]:
    hs = event.get("homeScore") or {}
    as_ = event.get("awayScore") or {}
    def _num(v: Any) -> int:
        try:
            return int(v)
        except Exception:
            return 0
    return _num(hs.get("current") or hs.get("normaltime")), _num(as_.get("current") or as_.get("normaltime"))


def _extract_minute(event: Dict[str, Any]) -> Optional[int]:
    t = event.get("time") or {}
    minute = t.get("minute")
    return minute if isinstance(minute, int) else None


def _to_iso_utc(ts: Any) -> Optional[str]:
    """Sofascore obično vraća epoch u sekundama. Pretvori u ISO UTC ili vrati None."""
    if ts is None:
        return None
    try:
        ts_int = int(ts)
        return datetime.fromtimestamp(ts_int, tz=timezone.utc).isoformat()
    except Exception:
        return None


# ---------------------------
# Glavna obrada
# ---------------------------

def process_events_with_teams(events: List[Any]) -> Dict[str, List[Dict[str, Any]]]:
    """
    Ulaz: lista 'events' (mješavina dict/string – štitimo se od krivih tipova)
    Izlaz: {"matches": [...], "teams": [...]}
    """
    matches: List[Dict[str, Any]] = []
    teams:   List[Dict[str, Any]] = []

    if not events:
        return {"matches": [], "teams": []}

    for ev in events:
        # zaštita protiv 'str' i sličnog što je rušilo: "'str' object has no attribute 'get'"
        if not isinstance(ev, dict):
            continue

        raw_status = ev.get("status") or {}
        status = clamp_to_db(map_status(raw_status))

        home = ev.get("homeTeam") or ev.get("home") or {}
        away = ev.get("awayTeam") or ev.get("away") or {}
        tournament = ev.get("tournament") or ev.get("competition") or {}

        home_name = _safe_team_name(home)
        away_name = _safe_team_name(away)
        home_score, away_score = _extract_scores(ev)

        start_time_iso = _to_iso_utc(ev.get("startTimestamp") or ev.get("startTime"))
        minute = _extract_minute(ev)

        # SofaScore event id (služi za deduplikaciju na (source, source_event_id))
        source_event_id = ev.get("id")

        # Sastavi match zapis – bez ručnog postavljanja 'id' (DB će ga generirati)
        match_row: Dict[str, Any] = {
            "home_team": home_name,
            "away_team": away_name,
            "home_score": home_score,
            "away_score": away_score,
            "start_time": start_time_iso,               # timestamptz prima ISO string
            "status": status,                           # u skladu s DB CHECK-om
            "status_type": status,                      # zadržavamo isto radi jednostavnosti
            "competition": str(tournament.get("name") or ""),
            "source": "sofascore",
            "source_event_id": source_event_id,
            "minute": minute,
        }
        # izbaci None vrijednosti da payload bude clean
        match_row = {k: v for k, v in match_row.items() if v is not None}
        matches.append(match_row)

        # Minimalni team zapisi (za zaseban upsert u teams tablicu)
        def _team_row(t: Dict[str, Any]) -> Dict[str, Any]:
            # t može biti prazan dict – _safe_team_name će to pokriti
            country = t.get("country") if isinstance(t.get("country"), dict) else {}
            return {
                "name": _safe_team_name(t),
                "short_name": t.get("shortName"),
                "country": country.get("name") if isinstance(country, dict) else None,
                "logo_url": t.get("logo") or t.get("crest") or t.get("teamLogo"),
                "sofascore_id": t.get("id"),
            }

        if isinstance(home, dict):
            teams.append(_team_row(home))
        if isinstance(away, dict):
            teams.append(_team_row(away))

    # uniq teams po sofascore_id ako postoji, inače po name
    uniq: Dict[Any, Dict[str, Any]] = {}
    for t in teams:
        key = t.get("sofascore_id") or t.get("name")
        if key and key not in uniq:
            # očisti None vrijednosti
            clean = {k: v for k, v in t.items() if v not in (None, "", [])}
            uniq[key] = clean

    out = {"matches": matches, "teams": list(uniq.values())}
    logger.info(f"✅ Processed {len(out['matches'])} matches, {len(out['teams'])} unique teams")
    return out


def prepare_for_database(processed: Dict[str, List[Dict[str, Any]]]) -> Dict[str, List[Dict[str, Any]]]:
    """
    Dodatna sanitizacija prije slanja u DB.
    Zadržavamo samo dozvoljena polja i čistimo None.
    """
    if not processed:
        return {"matches": [], "teams": []}

    allowed_match_fields = {
        "home_team", "away_team",
        "home_score", "away_score",
        "start_time",
        "status", "status_type",
        "competition",
        "source", "source_event_id",
        "minute",
        "competition_id", "season", "round", "venue",
        "home_color", "away_color",
        "current_period_start",
        "league_priority",
        "updated_at",
    }

    clean_matches: List[Dict[str, Any]] = []
    for m in processed.get("matches", []):
        # clamp status ako je slučajno promijenjen nizvodno
        m["status"] = clamp_to_db(m.get("status"))
        # izbaci sve što nije očekivano i None vrijednosti
        clean = {k: v for k, v in m.items() if k in allowed_match_fields and v is not None}
        clean_matches.append(clean)

    clean_teams: List[Dict[str, Any]] = []
    for t in processed.get("teams", []):
        clean = {k: v for k, v in t.items() if v is not None}
        clean_teams.append(clean)

    logger.info(f"✅ Prepared {len(clean_matches)} matches and {len(clean_teams)} teams for database")
    return {"matches": clean_matches, "teams": clean_teams}
