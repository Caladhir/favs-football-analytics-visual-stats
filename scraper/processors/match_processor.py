# scraper/processors/match_processor.py
from __future__ import annotations
from typing import Any, Dict, List
from datetime import datetime, timezone

from .status_processor import status_processor
from .team_processor import team_processor
from .competition_processor import competition_processor
from .events_processor import events_processor
from .stats_processor import stats_processor
from .shots_processor import shots_processor
from .avg_positions_processor import avg_positions_processor

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
        shots: List[Dict[str, Any]] = []
        average_positions: List[Dict[str, Any]] = []

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
            # Derive status_type separately (raw description) for richer UI filtering
            raw_status_desc = None
            try:
                raw_status_desc = (base.get("status") or {}).get("description") or (base.get("status") or {}).get("type") or base.get("statusType")
            except Exception:
                raw_status_desc = None

            # osnovno polje datuma – SofaScore obično ima "startTimestamp" (epoch)
            date_utc = _get(base.get("startTimestamp") or base.get("startTimeUTC") or base.get("startTime"))

            # Team colors for quick theming (fallback defaults)
            home_colors = (base.get("homeTeam") or {}).get("teamColors") or {}
            away_colors = (base.get("awayTeam") or {}).get("teamColors") or {}
            home_color = home_colors.get("primary") or "#222222"
            away_color = away_colors.get("primary") or "#222222"
            # Current period start timestamp if exposed
            current_period_start = None
            try:
                cps = (base.get("time") or {}).get("currentPeriodStartTimestamp")
                if cps:
                    current_period_start = _get(cps)
            except Exception:
                current_period_start = None

            # Compose a match row ready for DB insertion.
            is_finished = False
            try:
                st_raw = (base.get("status") or {}).get("type") or (base.get("status") or {}).get("description") or stat.get("status")
                if st_raw and str(st_raw).lower() in {"finished","afteret","aft","ft"}:
                    is_finished = True
            except Exception:
                is_finished = False
            match_row = {
                "source": "sofascore",
                "source_event_id": ev_id,
                "start_time": date_utc,
                "status": stat["status"],
                "home_team": (base.get("homeTeam") or {}).get("name"),
                "away_team": (base.get("awayTeam") or {}).get("name"),
                "home_team_sofascore_id": enriched.get("home_team_sofa") or (base.get("homeTeam") or {}).get("id"),
                "away_team_sofascore_id": enriched.get("away_team_sofa") or (base.get("awayTeam") or {}).get("id"),
                "home_score": stat.get("home_score"),
                "away_score": stat.get("away_score"),
                "home_score_ht": stat.get("home_score_ht"),
                "away_score_ht": stat.get("away_score_ht"),
                # Preserve a snapshot of final score if finished to prevent later overwrite by in‑play pollers
                "final_home_score": stat.get("home_score") if is_finished else None,
                "final_away_score": stat.get("away_score") if is_finished else None,
                "competition_sofascore_id": (comp or {}).get("sofascore_id"),
                "round": base.get("roundInfo", {}).get("round") if isinstance(base.get("roundInfo"), dict) else base.get("round"),
                "season": (base.get("season") or {}).get("name") if isinstance(base.get("season"), dict) else base.get("season"),
                "venue": (base.get("venue") or {}).get("name") if isinstance(base.get("venue"), dict) else None,
                "status_type": raw_status_desc,
                "home_color": home_color,
                "away_color": away_color,
                "current_period_start": current_period_start,
                "is_finished": is_finished,
            }
            matches.append(match_row)

            # Player stats from raw lineups (if statistics embedded)
            raw_lineups = enriched.get("_raw_lineups") or {}
            try:
                if raw_lineups:
                    player_stats.extend(stats_processor.process_player_stats(raw_lineups, ev_id))
            except Exception:
                pass

            # Match (team) stats
            raw_stats = enriched.get("statistics") or {}
            try:
                if raw_stats:
                    match_stats.extend(stats_processor.process_match_stats(raw_stats, ev_id))
            except Exception:
                pass

            # Shots
            raw_shots = enriched.get("_raw_shots")
            try:
                if raw_shots:
                    shots.extend(shots_processor.parse(raw_shots, ev_id))
            except Exception:
                pass

            # Average positions
            raw_avg = enriched.get("_raw_avg_positions")
            try:
                if raw_avg:
                    average_positions.extend(avg_positions_processor.parse(raw_avg, ev_id))
            except Exception:
                pass

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
            "shots": shots,
            "average_positions": average_positions,
        }
        return bundle
