#utils.py
from pathlib import Path
import sys
sys.path.append(str(Path(__file__).parent.parent))

from core.database import db
import uuid


def upsert_team(team):
    data = {
        "id": str(uuid.uuid5(uuid.NAMESPACE_DNS, f"sofa_team_{team['sofascore_id']}")),
        "name": team.get("name"),
        "short_name": team.get("shortName"),
        "country": team.get("country", {}).get("name"),
        "logo_url": team.get("logo", {}).get("medium"),
        "sofascore_id": team.get("sofascore_id")
    }
    db.client.table("teams").upsert(data, on_conflict=["sofascore_id"]).execute()

def upsert_player(player, team_id):
    data = {
        "id": str(uuid.uuid5(uuid.NAMESPACE_DNS, f"sofa_player_{player['sofascore_id']}")),
        "full_name": player.get("name"),
        "position": player.get("position"),
        "number": player.get("shirtNumber"),
        "team_id": team_id,
        "nationality": player.get("country", {}).get("name"),
        "age": player.get("age"),
        "height_cm": player.get("height"),
        "weight_kg": player.get("weight"),
        "sofascore_id": player.get("sofascore_id")
    }
    db.client.table("players").upsert(data, on_conflict=["sofascore_id"]).execute()

def upsert_lineup(match_id, team_id, player, pinfo):
    data = {
        "match_id": match_id,
        "team_id": team_id,
        "player_id": str(uuid.uuid5(uuid.NAMESPACE_DNS, f"sofa_player_{player['sofascore_id']}")),
        "position": pinfo.get("position"),
        "jersey_number": player.get("shirtNumber"),
        "is_starting": pinfo.get("is_starting", False),
        "is_captain": pinfo.get("is_captain", False)
    }
    db.client.table("lineups").upsert(data, on_conflict=["match_id", "player_id"]).execute()

def upsert_player_stats(match_id, team_id, player_id, stats):
    data = {
        "match_id": match_id,
        "player_id": player_id,
        "team_id": team_id,
        "goals": stats.get("goals", 0),
        "assists": stats.get("assists", 0),
        "shots": stats.get("shotsTotal", 0),
        "passes": stats.get("passes", 0),
        "tackles": stats.get("tackles", 0),
        "rating": stats.get("rating"),
        "minutes_played": stats.get("minutesPlayed", 0),
        "is_substitute": stats.get("substitute", False),
        "was_subbed_in": stats.get("subbedIn", False),
        "was_subbed_out": stats.get("subbedOut", False)
    }
    db.client.table("player_stats").upsert(data, on_conflict=["match_id", "player_id"]).execute()

def upsert_formation(match_id, team_id, formation):
    data = {
        "match_id": match_id,
        "team_id": team_id,
        "formation": formation
    }
    db.client.table("formations").upsert(data, on_conflict=["match_id", "team_id"]).execute()

def upsert_manager(manager, team_id):
    data = {
        "id": str(uuid.uuid5(uuid.NAMESPACE_DNS, f"sofa_manager_{manager['sofascore_id']}")),
        "full_name": manager.get("name"),
        "nationality": manager.get("country", {}).get("name"),
        "birth_date": manager.get("dateOfBirth"),
        "team_id": team_id,
        "sofascore_id": manager.get("sofascore_id")
    }
    db.client.table("managers").upsert(data, on_conflict=["sofascore_id"]).execute()
