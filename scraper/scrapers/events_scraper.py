# scraper/scrapers/events_scraper.py - Match Events Scraper (robust)
from typing import List, Dict, Any, Optional, Tuple
from .base_scraper import BaseScraper
from utils.logger import get_logger

logger = get_logger(__name__)

ALLOWED_EVENT_TYPES = {
    "goal", "own_goal", "penalty_goal", "penalty_miss",
    "yellow_card", "red_card", "second_yellow",
    "substitution_in", "substitution_out",
    "var", "kickoff", "half_time", "full_time", "period_start", "period_end",
}

def _as_min(x) -> Optional[int]:
    if isinstance(x, dict):
        for k in ("current", "minute", "min", "time"):
            if k in x:
                x = x[k]
                break
    try:
        return int(x)
    except Exception:
        return None

def _side_key(v) -> Optional[str]:
    return "home" if v in ("home", 1, "1", True) else ("away" if v in ("away", 2, "2", False) else None)

def _norm_event_type(et: Optional[str], color: Optional[str] = None) -> Optional[str]:
    s = (et or "").strip().lower().replace(" ", "_")
    c = (color or "").strip().lower()
    if s in ALLOWED_EVENT_TYPES:
        return s
    if s in {"yellow", "yellowcard", "booking", "booked"}:
        return "yellow_card"
    if s in {"red", "redcard", "straight_red"}:
        return "red_card"
    if s in {"secondyellow", "second_yellow", "2nd_yellow"}:
        return "second_yellow"
    if s == "card":
        if c.startswith("y"):
            return "yellow_card"
        if c.startswith("r"):
            return "red_card"
        return None
    if s in {"penalty", "pen"}:
        return "penalty_goal"
    if s in {"sub", "substitution"}:
        # incident 'substitution' ćemo rastaviti na IN i OUT unutar koda
        return "substitution"
    return None

class MatchEventsScraper(BaseScraper):
    """Scraper za match events (goals, cards, subs...) s istim tipovima koje koristi debug runner."""

    def __init__(self, browser_manager):
        super().__init__(browser_manager)

    def get_match_events(self, match_id: str) -> List[Dict[str, Any]]:
        try:
            endpoint = f"event/{match_id}/incidents"
            logger.info(f"Fetching events for match {match_id}")
            data = self._fetch(endpoint)
            incidents = []
            if isinstance(data, dict):
                incidents = data.get("incidents") or data.get("events") or []
            elif isinstance(data, list):
                incidents = data

            out: List[Dict[str, Any]] = []
            for inc in incidents:
                rows = self._process_incident_into_rows(inc, match_id)
                if rows:
                    out.extend(rows)
            logger.info(f"✅ Processed {len(out)} events for match {match_id}")
            return out
        except Exception as e:
            logger.error(f"Failed to fetch events for match {match_id}: {e}")
            return []

    def _process_incident_into_rows(self, inc: Dict[str, Any], match_id: str) -> List[Dict[str, Any]]:
        """Neki incidenti mapiraju u 0, 1 ili 2 reda (npr. substitution -> IN i OUT)."""
        try:
            raw_type = inc.get("incidentType") or inc.get("type")
            color = inc.get("color") or inc.get("cardColor") or inc.get("card")
            mapped = _norm_event_type(raw_type, color)
            if mapped is None:
                return []  # skip nebitne tipove

            minute = _as_min(inc.get("time") or inc.get("minute") or inc.get("playerOffTime"))
            team = _side_key(inc.get("isHome")) or _side_key(inc.get("team")) or _side_key(inc.get("side"))
            if team not in ("home", "away"):
                return []

            def base(desc: str, player_name: Optional[str]) -> Dict[str, Any]:
                return {
                    "match_id": match_id,
                    "minute": minute,
                    "event_type": mapped if mapped != "substitution" else "substitution_in",  # default za IN
                    "player_name": player_name,
                    "team": team,
                    "description": desc,
                    "card_color": color,
                }

            # Goals / cards / var / penalties idu 1:1
            if mapped in (
                "goal", "own_goal", "yellow_card", "red_card", "second_yellow", "var",
                "penalty_goal", "penalty_miss",
            ):
                player = (inc.get("player") or {}).get("name") or inc.get("playerName")
                desc = self._build_event_description(inc, mapped)
                return [base(desc, player)]

            # Substitution -> 2 reda: OUT i IN (koristimo iste minute)
            if mapped == "substitution":
                pin = (inc.get("playerIn") or {}).get("name")
                pout = (inc.get("playerOut") or {}).get("name")
                desc = self._build_event_description(inc, "substitution")
                row_in = base(desc, pin)
                row_in["event_type"] = "substitution_in"
                row_out = base(desc, pout)
                row_out["event_type"] = "substitution_out"
                return [row_out, row_in]

            # ostalo (kickoff/half_time/full_time/period_start/period_end)
            desc = self._build_event_description(inc, mapped)
            return [base(desc, None)]

        except Exception as e:
            logger.warning(f"Failed to process incident: {e}")
            return []

    def _build_event_description(self, incident: Dict[str, Any], event_type: str) -> str:
        try:
            minute = _as_min(incident.get("time") or incident.get("minute")) or 0
            added_time = incident.get("addedTime")
            t = f"{minute}'" if not added_time else f"{minute}+{added_time}'"

            if event_type in ("goal", "penalty_goal"):
                player = (incident.get("player") or {}).get("name") or "Unknown"
                assist = (incident.get("assist") or {}).get("name")
                if assist:
                    return f"⚽ Goal by {player} (assist: {assist}) - {t}"
                return f"⚽ Goal by {player} - {t}"
            if event_type == "own_goal":
                player = (incident.get("player") or {}).get("name") or "Unknown"
                return f"⚽ Own goal by {player} - {t}"
            if event_type == "yellow_card":
                player = (incident.get("player") or {}).get("name") or "Unknown"
                reason = incident.get("reason") or ""
                suffix = f" ({reason})" if reason else ""
                return f"🟨 Yellow card for {player}{suffix} - {t}"
            if event_type == "red_card":
                player = (incident.get("player") or {}).get("name") or "Unknown"
                reason = incident.get("reason") or ""
                suffix = f" ({reason})" if reason else ""
                return f"🟥 Red card for {player}{suffix} - {t}"
            if event_type == "substitution":
                pin = (incident.get("playerIn") or {}).get("name") or "Unknown"
                pout = (incident.get("playerOut") or {}).get("name") or "Unknown"
                return f"🔄 Substitution: {pin} ← {pout} - {t}"
            if event_type == "penalty_miss":
                player = (incident.get("player") or {}).get("name") or "Unknown"
                return f"❌ Penalty missed by {player} - {t}"
            if event_type == "var":
                return f"📺 VAR Review - {t}"
            return f"{event_type.replace('_',' ').title()} - {t}"
        except Exception:
            return f"{event_type} - {incident.get('time', 0)}'"

    def get_events_for_matches(self, match_ids: List[str]) -> List[Dict[str, Any]]:
        all_events: List[Dict[str, Any]] = []
        for mid in match_ids:
            all_events.extend(self.get_match_events(mid))
        logger.info(f"✅ Total events fetched: {len(all_events)} for {len(match_ids)} matches")
        return all_events

    def scrape(self) -> List[Dict[str, Any]]:
        logger.warning("MatchEventsScraper.scrape() called - use get_match_events() instead")
        return []
