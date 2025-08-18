# scraper/processors/match_processor.py
from __future__ import annotations
from typing import Any, Dict, List
from datetime import datetime, timezone

from .status_processor import status_processor
from .team_processor import team_processor
from .competition_processor import competition_processor
from .events_processor import events_processor

def _get(dt_val) -> str:
    # Vrati ISO8601 u UTC ako postoji timestamp/iso u eventu
    if not dt_val:
        return None
    if isinstance(dt_val, (int, float)):  # epoch millis/sec?
        if dt_val > 10**12:
            dt_val = dt_val / 1000.0
        try:
            return datetime.utcfromtimestamp(dt_val).replace(tzinfo=timezone.utc).isoformat()
        except Exception:
            return None
    if isinstance(dt_val, str):
        try:
            # pretpostavi već UTC ISO
            return datetime.fromisoformat(dt_val.replace("Z", "+00:00")).astimezone(timezone.utc).isoformat()
        except Exception:
            return dt_val
    return None

class MatchProcessor:
    """
    Prima listu enriched_event-ova i vraća 'bundle' spreman za DB sloj.
    """
    def process(self, enriched_events: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
        competitions: Dict[int, Dict[str, Any]] = {}
        teams: Dict[int, Dict[str, Any]] = {}
        players: Dict[int, Dict[str, Any]] = {}

        matches: List[Dict[str, Any]] = []
        lineups: List[Dict[str, Any]] = []
        formations: List[Dict[str, Any]] = []
        events: List[Dict[str, Any]] = []
        # stats dodaje fetch_loop kroz StatsProcessor (enhance), ali možemo i ovdje ostaviti prazno
        player_stats: List[Dict[str, Any]] = []
        match_stats: List[Dict[str, Any]] = []

        for enriched in enriched_events:
            base = enriched.get("event") or enriched  # fleksibilno
            ev_id = int(enriched.get("event_id") or base.get("id"))

            # competition
            comp = competition_processor.parse(base)
            if comp:
                competitions[comp["sofascore_id"]] = comp

            # teams
            for t in team_processor.parse_teams(base, enriched):
                teams[t["sofascore_id"]] = t

            # players & lineups & formations
            for p in team_processor.parse_players(enriched):
                players[p["sofascore_id"]] = p
            lineups.extend(team_processor.parse_lineups(enriched))
            formations.extend(team_processor.parse_formations(enriched))

            # events (incidents)
            events.extend(events_processor.parse(enriched))

            # status/scores
            stat = status_processor.parse(base)

            # osnovno polje datuma – SofaScore obično ima "startTimestamp" (epoch)
            date_utc = _get(base.get("startTimestamp") or base.get("startTimeUTC") or base.get("startTime"))

            # Compose a match row ready for DB insertion.  The Supabase schema
            # expects `start_time` (timestamp in UTC) and textual `home_team`/
            # `away_team` names.  We keep the Sofascore IDs on the match
            # object until later – they are mapped to FK IDs in the
            # storage phase.  Additional half‑time score fields are kept
            # for completeness but will be dropped by the DB layer if not
            # supported.
            match_row = {
                "source": "sofascore",
                "source_event_id": ev_id,
                # Use start_time instead of date_utc to align with DB column
                "start_time": date_utc,
                "status": stat["status"],
                # Team names are required (not null) in the DB schema
                "home_team": (base.get("homeTeam") or {}).get("name"),
                "away_team": (base.get("awayTeam") or {}).get("name"),
                "home_team_sofascore_id": enriched.get("home_team_sofa") or (base.get("homeTeam") or {}).get("id"),
                "away_team_sofascore_id": enriched.get("away_team_sofa") or (base.get("awayTeam") or {}).get("id"),
                "home_score": stat.get("home_score"),
                "away_score": stat.get("away_score"),
                "home_score_ht": stat.get("home_score_ht"),
                "away_score_ht": stat.get("away_score_ht"),
                "competition_sofascore_id": (comp or {}).get("sofascore_id"),
                # Additional optional fields
                "round": base.get("roundInfo", {}).get("round") if isinstance(base.get("roundInfo"), dict) else base.get("round"),
                "season": (base.get("season") or {}).get("name") if isinstance(base.get("season"), dict) else base.get("season"),
                "venue": (base.get("venue") or {}).get("name") if isinstance(base.get("venue"), dict) else None,
            }
            matches.append(match_row)

        bundle = {
            "competitions": list(competitions.values()),
            "teams": list(teams.values()),
            "players": list(players.values()),
            "matches": matches,
            "lineups": lineups,
            "formations": formations,
            "events": events,
            "player_stats": player_stats,
            "match_stats": match_stats,
        }
        return bundle
