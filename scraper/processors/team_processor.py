# scraper/processors/team_processor.py
import uuid
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from core.database import db
from utils.logger import get_logger

logger = get_logger(__name__)

class TeamProcessor:
    """Processes team data for database storage (usklađeno s trenutačnom DB shemom)."""

    def __init__(self):
        # SofaScore team id (int) -> DB UUID (str)
        self.team_cache: Dict[int, str] = {}

    def process_teams(self, teams_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Pripremi team zapise za DB (samo kolone koje postoje u tablici teams)."""
        if not teams_data:
            return []

        logger.info(f"Processing {len(teams_data)} teams...")
        processed: List[Dict[str, Any]] = []

        for t in teams_data:
            try:
                sofascore_id = t.get("id")
                name = t.get("name") or t.get("shortName") or t.get("teamName")
                if not sofascore_id or not name:
                    continue

                # Deterministički UUID iz SofaScore ID-a (stabilno spajanje kroz projekte)
                team_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"sofascore_team_{sofascore_id}"))
                self.team_cache[int(sofascore_id)] = team_uuid

                db_team = {
                    "id": team_uuid,
                    "name": name,
                    "short_name": t.get("short_name") or t.get("shortName"),
                    "country": (t.get("country") or t.get("category", {}).get("name")),
                    "logo_url": (t.get("logo_url") or t.get("teamLogo") or t.get("crest") or t.get("image")),
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "sofascore_id": int(sofascore_id),
                }
                # Ukloni None vrijednosti
                db_team = {k: v for k, v in db_team.items() if v is not None}
                processed.append(db_team)
            except Exception as e:
                logger.warning(f"Failed to process team {t!r}: {e}")

        logger.info(f"✅ Processed {len(processed)} teams for database")
        return processed

    def get_team_uuid(self, sofascore_id: int) -> Optional[str]:
        """Vrati DB UUID za SofaScore ID (iz cachea ili iz baze)."""
        try:
            key = int(sofascore_id)
        except Exception:
            return None

        if key in self.team_cache:
            return self.team_cache[key]

        try:
            res = db.client.table("teams").select("id").eq("sofascore_id", key).limit(1).execute()
            if res.data:
                team_uuid = res.data[0]["id"]
                self.team_cache[key] = team_uuid
                return team_uuid
        except Exception as e:
            logger.warning(f"Team lookup failed for {sofascore_id}: {e}")
        return None

    def store_teams(self, teams: List[Dict[str, Any]]) -> tuple[int, int]:
        """Upsert timova po sofascore_id (unique index postoji u bazi)."""
        if not teams:
            return (0, 0)
        try:
            db.client.table("teams").upsert(teams, on_conflict="sofascore_id").execute()
            return (len(teams), 0)
        except Exception as e:
            logger.error(f"Failed to store teams: {e}")
            return (0, len(teams))


# Global instance
team_processor = TeamProcessor()

# ---- Thin wrappers (da import u ostalim modulima radi bez refaktora) ----
def build_team_records(teams_raw: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return team_processor.process_teams(teams_raw)

def get_team_uuid(sofascore_id: int) -> Optional[str]:
    return team_processor.get_team_uuid(sofascore_id)

def store_teams(teams: List[Dict[str, Any]]) -> tuple[int, int]:
    return team_processor.store_teams(teams)
