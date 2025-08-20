# scraper/scrapers/team_scraper.py - Teams and Enhanced Data (robust)
from typing import List, Dict, Any, Optional
from .base_scraper import BaseScraper
from utils.logger import get_logger

logger = get_logger(__name__)

class TeamScraper(BaseScraper):
    """Scraper for team data and enhanced match information"""

    def __init__(self, browser_manager):
        super().__init__(browser_manager)
        self.teams_cache: Dict[int, Dict[str, Any]] = {}

    def get_team_details(self, team_id: int) -> Optional[Dict[str, Any]]:
        if team_id in self.teams_cache:
            return self.teams_cache[team_id]
        try:
            endpoint = f"team/{team_id}"
            data = self._fetch(endpoint)
            if not isinstance(data, dict) or "team" not in data:
                logger.warning(f"No team data for ID {team_id}")
                return None

            t = data["team"] or {}
            name = t.get("name") or t.get("shortName") or f"Team {team_id}"  # NOT NULL fallback
            processed = {
                "id": t.get("id") or team_id,
                "name": name,
                "short_name": t.get("shortName") or "",
                "country": (t.get("country") or {}).get("name") or "",
                "logo_url": f"https://api.sofascore.app/api/v1/team/{team_id}/image",
                "primary_color": (t.get("teamColors") or {}).get("primary") or "#000000",
                "secondary_color": (t.get("teamColors") or {}).get("secondary") or "#FFFFFF",
                "founded": t.get("foundationDateTimestamp"),
                "venue": (t.get("venue") or {}).get("name"),
                "venue_capacity": (t.get("venue") or {}).get("capacity"),
            }
            self.teams_cache[team_id] = processed
            logger.info(f"✅ Fetched team: {processed['name']}")
            return processed
        except Exception as e:
            logger.error(f"Failed to fetch team {team_id}: {e}")
            return None

    def get_teams_from_matches(self, matches: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        teams: List[Dict[str, Any]] = []
        seen = set()
        for m in matches:
            # Podržimo i varijante: event payload (homeTeam/awayTeam) i naš enriched (home_team_sofa/away_team_sofa)
            hid = (m.get("homeTeam") or {}).get("id") or m.get("home_team_sofa") or m.get("home_team_sofascore_id")
            aid = (m.get("awayTeam") or {}).get("id") or m.get("away_team_sofa") or m.get("away_team_sofascore_id")
            for tid in [hid, aid]:
                if tid and tid not in seen:
                    td = self.get_team_details(int(tid))
                    if td:
                        teams.append(td)
                        seen.add(tid)
        logger.info(f"✅ Processed {len(teams)} unique teams")
        return teams

    def scrape(self) -> List[Dict[str, Any]]:
        logger.warning("TeamScraper.scrape() called - use get_teams_from_matches() instead")
        return []
