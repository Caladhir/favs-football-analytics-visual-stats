# scraper/processors/stats_processor.py
from __future__ import annotations
from typing import Any, Dict, List, Optional, Tuple

def _to_int(x) -> Optional[int]:
    try:
        return int(x)
    except Exception:
        return None

class StatsProcessor:
    """
    Processes raw statistics returned by SofaScore for matches and players.

    For match statistics, SofaScore may return a heterogeneous set of items,
    each describing a metric for the home and away team.  We convert this
    into a row per side containing only the metrics supported by our
    ``match_stats`` table (possession, shots_total, shots_on_target,
    corners, fouls, offsides, yellow_cards, red_cards, passes,
    pass_accuracy, xg, xa, saves).

    For player statistics, SofaScore returns a list of players and their
    stats.  We extract a subset that fits the ``player_stats`` schema.  The
    current schema includes goals, assists, shots, passes, tackles,
    rating, minutes_played and substitution flags.  Fields such as
    ``shots_total`` or disciplinary cards are no longer persisted at the
    player level and will be omitted.  Unknown or missing values are set to
    ``None``.  We retain the team side ('home' or 'away') to allow later
    mapping of team IDs.
    """

    # Mapping of normalised statistic names to our canonical field names
    _STAT_KEYS_MAP = {
        "ballpossession": "possession",
        "possession": "possession",
        "possession%": "possession",
        "possessionpercentage": "possession",
        "totalshots": "shots_total",
        "shots": "shots_total",
        "shotstotal": "shots_total",
        "shotsontarget": "shots_on_target",
        "shots_on_target": "shots_on_target",
        "shotsongoal": "shots_on_target",
        "corners": "corners",
        "cornerkicks": "corners",
        "cornerkicks": "corners",
        "fouls": "fouls",
        "foulscommitted": "fouls",
        "offsides": "offsides",
        "offside": "offsides",
        "yellowcards": "yellow_cards",
        "yellow card": "yellow_cards",
        "redcards": "red_cards",
        "red card": "red_cards",
        "totalpasses": "passes",
        "passes": "passes",
        "passess": "passes",
        "passesaccurate": "pass_accuracy",
        "passaccuracy": "pass_accuracy",
        "passsuccessrate": "pass_accuracy",
        "passaccuracy%": "pass_accuracy",
        "xg": "xg",
        "expectedgoals": "xg",
        "xa": "xa",
        "expectedassists": "xa",
        "saves": "saves",
        "goalkeepersaves": "saves",
    }

    def _parse_value(self, v: Any) -> Optional[float]:
        """Convert a raw value (string/number) into a numeric type."""
        if v is None:
            return None
        if isinstance(v, (int, float)):
            return float(v)
        if isinstance(v, str):
            s = v.strip().replace("%", "")
            s = s.replace(",", ".")
            try:
                return float(s)
            except Exception:
                return None
        return None

    def process_match_stats(self, raw: Dict[str, Any], event_id: int) -> List[Dict[str, Any]]:
        """Parse team‑level match statistics into DB‑friendly rows."""
        out: List[Dict[str, Any]] = []
        groups = raw.get("statistics") or raw.get("statisticsItems") or raw.get("groups") or []
        # Normalise groups into a list of items
        if isinstance(groups, dict):
            groups = [groups]
        # Accumulate metrics per side
        team_stats: Dict[str, Dict[str, Any]] = {"home": {}, "away": {}}
        for g in groups:
            items = g.get("statisticsItems") or g.get("items") or []
            for it in items:
                # Determine metric key
                metric = it.get("name") or it.get("title") or it.get("type") or ""
                key = str(metric).strip().lower().replace(" ", "").replace("_", "")
                canonical = self._STAT_KEYS_MAP.get(key)
                if not canonical:
                    continue
                # Extract values for home/away.  SofaScore sometimes nests values under 'value'.
                home_v = it.get("home") if "home" in it else it.get("value", {}).get("home")
                away_v = it.get("away") if "away" in it else it.get("value", {}).get("away")
                team_stats["home"][canonical] = self._parse_value(home_v)
                team_stats["away"][canonical] = self._parse_value(away_v)
        # Create one row per team side
        for side in ("home", "away"):
            row: Dict[str, Any] = {
                "source": "sofascore",
                "source_event_id": int(event_id),
                "team": side,
            }
            row.update(team_stats.get(side, {}))
            out.append(row)
        return out

    def process_player_stats(self, raw: Dict[str, Any], event_id: int) -> List[Dict[str, Any]]:
        """Parse player‑level statistics into DB‑friendly rows."""
        out: List[Dict[str, Any]] = []
        teams: List[Tuple[str, Any]] = []
        # Various raw formats: either keyed by "home"/"away" or a generic "players" list
        if "home" in raw or "away" in raw:
            teams = [("home", raw.get("home")), ("away", raw.get("away"))]
        elif "players" in raw:
            teams = [("home", raw), ("away", raw)]
        for side, node in teams:
            if not node:
                continue
            plist = node.get("players") or []
            for p in plist:
                pl = p.get("player") or {}
                pid = pl.get("id")
                if not pid:
                    continue
                stats = p.get("statistics") or p.get("stats") or {}
                # Build the base stat record.  Use helper _to_int for integer fields.
                # Build the base stat record.  Only include fields supported
                # by the ``player_stats`` table: goals, assists, shots,
                # passes, tackles, rating, minutes_played and substitution
                # flags.  Additional granular shot counts or card counts
                # are deliberately omitted because they are not persisted
                # at the player level in the current schema.
                rec: Dict[str, Any] = {
                    "source": "sofascore",
                    "source_event_id": int(event_id),
                    "team": side,
                    "player_sofascore_id": pid,
                    "minutes_played": _to_int(stats.get("minutesPlayed") or stats.get("minutes")),
                    # Convert rating to float if present
                    "rating": (float(stats.get("rating")) if isinstance(stats.get("rating"), (int, float, str)) and str(stats.get("rating")).strip() else None),
                    "goals": _to_int(stats.get("goals")),
                    "assists": _to_int(stats.get("assists")),
                    # Shots: use legacy total shots if available, otherwise None
                    "shots": _to_int(stats.get("shotsTotal") or stats.get("totalShots") or stats.get("shots")),
                    "passes": _to_int(stats.get("totalPasses") or stats.get("passes") or stats.get("passesTotal")),
                    "tackles": _to_int(stats.get("tackles")),
                }
                # Optional substitution indicators
                is_sub = p.get("isSubstitute") or p.get("substitute")
                if is_sub is not None:
                    rec["is_substitute"] = bool(is_sub)
                # Flags for subbed in/out – mark True if any value present
                sub_in = stats.get("subbedIn") or stats.get("wasSubbedIn") or p.get("subbedInTime")
                if sub_in:
                    rec["was_subbed_in"] = True
                sub_out = stats.get("subbedOut") or stats.get("wasSubbedOut") or p.get("subbedOutTime")
                if sub_out:
                    rec["was_subbed_out"] = True
                out.append(rec)
        return out

stats_processor = StatsProcessor()
