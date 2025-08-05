from supabase_client import supabase
import uuid


def upsert_team(team):
    data = {
        "id": str(uuid.uuid5(uuid.NAMESPACE_DNS, f"sofa_team_{team['id']}")),
        "name": team.get("name"),
        "short_name": team.get("shortName"),
        "country": team.get("country", {}).get("name"),
        "logo_url": team.get("logo", {}).get("medium")
    }
    supabase.table("teams").upsert(data, on_conflict=["id"]).execute()

def upsert_player(player, team_id):
    data = {
        "id": str(uuid.uuid5(uuid.NAMESPACE_DNS, f"sofa_player_{player['id']}")),
        "full_name": player.get("name"),
        "position": player.get("position"),
        "number": player.get("shirtNumber"),
        "team_id": team_id,
        "nationality": player.get("country", {}).get("name"),
        "age": player.get("age"),
        "height_cm": player.get("height"),
        "weight_kg": player.get("weight")
    }
    supabase.table("players").upsert(data, on_conflict=["id"]).execute()

def upsert_lineup(match_id, team_id, player, pinfo):
    data = {
        "match_id": match_id,
        "team_id": team_id,
        "player_id": str(uuid.uuid5(uuid.NAMESPACE_DNS, f"sofa_player_{player['id']}")),
        "position": pinfo.get("position"),
        "jersey_number": player.get("shirtNumber"),
        "is_starting": pinfo.get("captain", False),
        "is_captain": pinfo.get("captain", False)
    }
    supabase.table("lineups").insert(data).execute()

def upsert_player_stats(match_id, team_id, player_id, stats):
    data = {
        "match_id": match_id,
        "player_id": str(uuid.uuid5(uuid.NAMESPACE_DNS, f"sofa_player_{player_id}")),
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
    supabase.table("player_stats").upsert(data).execute()

def upsert_formation(match_id, team_id, formation):
    data = {
        "match_id": match_id,
        "team_id": team_id,
        "formation": formation
    }
    supabase.table("formations").upsert(data).execute()

def upsert_manager(manager, team_id):
    data = {
        "id": str(uuid.uuid5(uuid.NAMESPACE_DNS, f"sofa_manager_{manager['id']}")),
        "full_name": manager.get("name"),
        "nationality": manager.get("country", {}).get("name"),
        "birth_date": manager.get("dateOfBirth"),
        "team_id": team_id
    }
    supabase.table("managers").upsert(data).execute()
