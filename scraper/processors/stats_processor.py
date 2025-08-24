# scraper/processors/stats_processor.py
from __future__ import annotations
from typing import Any, Dict, List, Optional, Tuple

def _to_int(x) -> Optional[int]:
    try:
        return int(x)
    except Exception:
        return None

class StatsProcessor:
    """Enhanced SofaScore stats parser (match + player).

    Adds robust player stat synonyms: shots_total, shots_on_target, touches,
    yellow_cards, red_cards besides legacy fields. Keeps backward
    compatible 'shots' alias.
    """

    # Mapping of normalised statistic names to our canonical field names
    _STAT_KEYS_MAP = {
        "ballpossession": "possession",
        "possession": "possession",
        "possession%": "possession",
        "possessionpercentage": "possession",
        "totalshots": "shots_total",
        "totalshotsongoal": "shots_total",  # occasionally seen variant meaning overall shots
        "shots": "shots_total",
        "shotstotal": "shots_total",
        "shotsontarget": "shots_on_target",
        "shots_on_target": "shots_on_target",
        "shotsongoal": "shots_on_target",
        "shotsongoal%": "shots_on_target",
        "shotsongoalpercent": "shots_on_target",
        "shotsoffgoal": "shots_total",  # we fold off-target into total only
        "corners": "corners",
        "cornerkicks": "corners",
        "fouls": "fouls",
        "foulscommitted": "fouls",
        "offsides": "offsides",
        "offside": "offsides",
        "yellowcards": "yellow_cards",
        "yellowcard": "yellow_cards",
        "yellow card": "yellow_cards",
        "redcards": "red_cards",
        "redcard": "red_cards",
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
        "goalkeepersave": "saves",
        "goalkeepersaves%": "saves",
        "goalkeepersavespercent": "saves",
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
        out: List[Dict[str, Any]] = []
        teams: List[Tuple[str, Any]] = []
        if "home" in raw or "away" in raw:
            teams = [("home", raw.get("home")), ("away", raw.get("away"))]
        elif "players" in raw:
            teams = [("home", raw), ("away", raw)]
        syn = {
            "minutes_played": ["minutesplayed", "minutes", "playedminutes"],
            "shots_total": ["totalshots", "shotstotal", "shots"],
            "shots_on_target": ["shotsontarget", "ontargetshots", "shotsongoal"],
            "touches": ["touches", "balltouches", "totaltouches"],
            "yellow_cards": ["yellowcards", "yellow"],
            "red_cards": ["redcards", "red"],
            "passes": ["totalpasses", "passes", "passestotal"],
            "tackles": ["tackles", "tackleswon"],
        }
        def _pull(stats: Dict[str, Any], canonical: str):
            for k in [canonical] + syn.get(canonical, []):
                if k in stats and stats[k] not in (None, ""):
                    return stats[k]
            return None
        for side, node in teams:
            if not node:
                continue
            for p in node.get("players") or []:
                pl = p.get("player") or {}
                pid = pl.get("id")
                if not pid:
                    continue
                stats = p.get("statistics") or p.get("stats") or {}
                norm: Dict[str, Any] = {}
                for k, v in stats.items():
                    if isinstance(k, str):
                        norm[k.strip().lower().replace(" ", "").replace("_", "")] = v
                minutes_played = _to_int(_pull(norm, "minutes_played"))
                # Fallback: ONLY if minutes is missing (None) and player marked as starter, assume 90.
                # If it's explicitly 0 we keep 0 (means no minutes / DNP in your workflow).
                if minutes_played is None and (p.get("isStarting") or p.get("starting")):
                    minutes_played = 90
                shots_total = _to_int(_pull(norm, "shots_total"))
                shots_on_target = _to_int(_pull(norm, "shots_on_target"))
                touches = _to_int(_pull(norm, "touches"))
                # Rating variants (some payloads use ratingNum / playerRating)
                raw_rating = stats.get("rating") or stats.get("ratingNum") or stats.get("playerRating")
                try:
                    rating_val = float(raw_rating) if raw_rating not in (None, "") else None
                except Exception:
                    rating_val = None
                rec: Dict[str, Any] = {
                    "source": "sofascore",
                    "source_event_id": int(event_id),
                    "team": side,
                    "player_sofascore_id": pid,
                    "minutes_played": minutes_played,
                    "rating": rating_val,
                    "goals": _to_int(stats.get("goals")),
                    "assists": _to_int(stats.get("assists")),
                    "shots_total": shots_total,
                    "shots_on_target": shots_on_target,
                    "passes": _to_int(_pull(norm, "passes")),
                    "tackles": _to_int(_pull(norm, "tackles")),
                    "yellow_cards": _to_int(_pull(norm, "yellow_cards")),
                    "red_cards": _to_int(_pull(norm, "red_cards")),
                    "touches": touches,
                }
                is_sub = p.get("isSubstitute") or p.get("substitute")
                if is_sub is not None:
                    rec["is_substitute"] = bool(is_sub)
                if stats.get("subbedIn") or stats.get("wasSubbedIn") or p.get("subbedInTime"):
                    rec["was_subbed_in"] = True
                if stats.get("subbedOut") or stats.get("wasSubbedOut") or p.get("subbedOutTime"):
                    rec["was_subbed_out"] = True
                out.append(rec)
        return out

stats_processor = StatsProcessor()

# --- Backwards compatibility helper ---
def parse_event_statistics(event_id: int, raw: Dict[str, Any]) -> Dict[str, List[Dict[str, Any]]]:
    """Compatibility wrapper used by legacy scripts.

    Returns a dict with keys 'match_stats' and 'player_stats' derived from
    the provided raw statistics payload. This does not make any network
    calls and relies solely on the given data structure.

    Note: Player stats are only extracted if the raw payload includes
    player lists under 'home'/'away' (or a 'players' list). We do not
    fetch the deprecated 'player-statistics' endpoint.
    """
    try:
        match_stats = stats_processor.process_match_stats(raw or {}, event_id)
    except Exception:
        match_stats = []

    player_stats: List[Dict[str, Any]] = []
    try:
        # Only attempt player parsing if payload hints players are present
        if isinstance(raw, dict) and ("home" in raw or "away" in raw or "players" in raw):
            player_stats = stats_processor.process_player_stats(raw, event_id)
    except Exception:
        player_stats = []

    return {"match_stats": match_stats, "player_stats": player_stats}
