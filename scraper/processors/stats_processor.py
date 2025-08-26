# scraper/processors/stats_processor.py
from __future__ import annotations
from typing import Any, Dict, List, Optional, Tuple
import os
from utils.logger import get_logger
_sp_logger = get_logger(__name__)

# ==== helperi (dodaj u stats_processor.py ili gdje ti je zgodno) ====
def _to_int(x):
    try:
        if x is None or x == '':
            return None
        return int(round(float(x)))
    except Exception:
        return None

def _to_float(x):
    try:
        if x is None or x == '':
            return None
        return float(x)
    except Exception:
        return None

def extract_player_stats_from_sofa(stat: dict) -> dict:
    """Vrati dict s *isključivo* stupcima koji postoje u public.player_stats."""
    # Rating: always prefer ratingVersions.original (what UI shows). Fallbacks: explicit rating field, then alternative.
    rv = stat.get("ratingVersions") or {}
    rating = _to_float(rv.get("original"))
    if rating is None:  # some older events may only have 'rating'
        rating = _to_float(stat.get("rating"))
    if rating is None:  # last resort: alternative version
        rating = _to_float(rv.get("alternative"))

    return {
        # redoslijed nije bitan, ali držimo isti naziv kao u bazi:
        "goals":            _to_int(stat.get("goals")),  # često ga nema u ovom endpointu
        "assists":          _to_int(stat.get("goalAssist") or stat.get("assists")),
        "passes":           _to_int(stat.get("totalPass") or stat.get("totalPasses") or stat.get("passesTotal") or stat.get("passes")),
        "tackles":          _to_int(stat.get("totalTackle") or stat.get("totalTackles") or stat.get("tackles")),
        "shots_total":      _to_int(stat.get("totalScoringAttempt") or stat.get("scoringAttempt") or stat.get("shotsTotal") or stat.get("totalShots") or stat.get("shots")),
        "shots_on_target":  _to_int(stat.get("onTargetScoringAttempt") or stat.get("shotsOnTarget") or stat.get("onTargetShots")),
        "minutes_played":   _to_int(stat.get("minutesPlayed") or stat.get("minutes")),
        "touches":          _to_int(stat.get("touches") or stat.get("ballTouches") or stat.get("touchesCount") or stat.get("totalTouches")),
    "rating":           rating,
        # is_substitute/was_subbed_in/was_subbed_out popuni iz subs/lineups procesora (ne iz ovog endpointa)
    }

class StatsProcessor:
    """SofaScore stats parser (match + player).

    NOTE (simplified per user request): Player stat extraction rolled back to a
    minimal, direct mapping that ONLY pulls columns that exist in public.player_stats
    and uses the exact SofaScore per-player endpoint keys (e.g. totalPass, totalTackle,
    onTargetScoringAttempt, minutesPlayed, touches, rating / ratingVersions.original).
    We update a player's row ONLY with non-None values to avoid overwriting previously
    computed data with nulls. Fallback logic for shots_total (sum of onTarget + blocked + off/shotOff)
    is included so we get a value even if no aggregate key exists. Substitution flags &
    bench handling logic from previous version are retained.
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
    "accuratepasses": "accurate_passes",  # intermediate key (we'll transform to pass_accuracy % later)
        "passaccuracy": "pass_accuracy",
        "passsuccessrate": "pass_accuracy",
        "passaccuracy%": "pass_accuracy",
        "xg": "xg",
        "expectedgoals": "xg",
    # Removed XA (expected assists) per requirement – not captured in match_stats now
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
        # SofaScore current structure: { statistics: [ { period: "ALL", groups: [ { statisticsItems: [...] } ] }, ... ] }
        periods = raw.get("statistics") or []
        # Backwards compatibility: if raw itself is the list of groups
        if isinstance(periods, list) and periods and all("groupName" in p or "statisticsItems" in p for p in periods):
            # Treat list directly as groups (legacy)
            target_groups = periods
        else:
            target = None
            if isinstance(periods, list):
                for p in periods:
                    if isinstance(p, dict) and str(p.get("period")).upper() == "ALL":
                        target = p
                        break
                if not target and periods:
                    target = periods[0]
            elif isinstance(periods, dict):  # rare edge
                target = periods
            if target and isinstance(target, dict):
                target_groups = target.get("groups") or []
            else:
                target_groups = []
        # Accumulate metrics per side (working store); also keep raw accurate passes for later percentage calc
        team_stats: Dict[str, Dict[str, Any]] = {"home": {}, "away": {}}
        raw_accurate: Dict[str, Dict[str, float]] = {"home": {}, "away": {}}
        for g in target_groups:
            items = g.get("statisticsItems") or g.get("items") or []
            for it in items:
                metric = it.get("name") or it.get("title") or it.get("type") or it.get("key") or ""
                key = str(metric).strip().lower().replace(" ", "").replace("_", "")
                canonical = self._STAT_KEYS_MAP.get(key)
                if not canonical:
                    continue
                home_v = it.get("home") if "home" in it else it.get("value", {}).get("home")
                away_v = it.get("away") if "away" in it else it.get("value", {}).get("away")
                hv = self._parse_value(home_v)
                av = self._parse_value(away_v)
                if canonical == "accurate_passes":
                    if hv is not None:
                        raw_accurate["home"]["accurate_passes"] = hv
                    if av is not None:
                        raw_accurate["away"]["accurate_passes"] = av
                    continue  # we will convert later
                team_stats["home"][canonical] = hv
                team_stats["away"][canonical] = av
        # Derive pass_accuracy (%) if missing but we have passes + accurate_passes
        for side in ("home","away"):
            if "pass_accuracy" not in team_stats[side]:
                acc = raw_accurate[side].get("accurate_passes")
                total = team_stats[side].get("passes")
                if acc is not None and total and total > 0:
                    team_stats[side]["pass_accuracy"] = round(100.0 * acc / total)
            # Ensure red_cards defaults to 0 (and optionally yellow_cards) when statistic absent
            if "red_cards" not in team_stats[side]:
                team_stats[side]["red_cards"] = 0
            if "yellow_cards" not in team_stats[side]:
                team_stats[side]["yellow_cards"] = 0
            # Also default core numeric counters to 0 if any stats parsed at all
            core_ints = ["possession","shots_total","shots_on_target","corners","fouls","offsides","passes","saves"]
            if any(team_stats[side].values()):
                for k in core_ints:
                    if k not in team_stats[side]:
                        team_stats[side][k] = 0
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

    def process_player_stats(
        self,
        raw: Dict[str, Any],
        event_id: int,
        subbed_in_ids: Optional[set] = None,
        subbed_out_ids: Optional[set] = None,
        team_id_map: Optional[Dict[str, int]] = None,
    ) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        teams: List[Tuple[str, Any]] = []
        if "home" in raw or "away" in raw:
            teams = [("home", raw.get("home")), ("away", raw.get("away"))]
        elif "players" in raw:  # legacy structure fallback
            teams = [("home", raw), ("away", raw)]

        def _first(d: Dict[str, Any], *keys):
            for k in keys:
                if k in d and d[k] not in (None, ""):
                    return d[k]
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
                if not stats and isinstance(pl.get("statistics"), dict):
                    stats = pl.get("statistics")

                # Use unified helper for extraction
                extracted = extract_player_stats_from_sofa(stats)
                # Fallback sum for shots_total if helper returned None
                if extracted.get("shots_total") is None:
                    comp_vals = []
                    for k in ("onTargetScoringAttempt", "offTargetScoringAttempt", "shotOffTarget", "shotsOffTarget", "blockedScoringAttempt"):
                        v = _to_int(stats.get(k))
                        if v is not None:
                            comp_vals.append(v)
                    if comp_vals:
                        extracted["shots_total"] = sum(comp_vals)

                rec: Dict[str, Any] = {
                    "source": "sofascore",
                    "source_event_id": int(event_id),
                    "team": side,
                    "player_sofascore_id": pid,
                }
                # Only set non-None values to avoid wiping prior data
                for k, v in extracted.items():
                    if v is not None:
                        rec[k] = v

                # Substitution heuristics (kept)
                is_starting = bool(p.get("isStarting") or p.get("starting"))
                sub_in_time = p.get("subbedInTime") or stats.get("subbedInTime")
                sub_out_time = p.get("subbedOutTime") or stats.get("subbedOutTime")
                explicit_is_sub = p.get("isSubstitute")
                if explicit_is_sub is None:
                    explicit_is_sub = p.get("substitute")

                # Determine raw participation flags from incidents/lineups
                was_in = False
                was_out = False
                if sub_in_time is not None:
                    was_in = True
                if sub_out_time is not None:
                    was_out = True
                if subbed_in_ids and pid in subbed_in_ids:
                    was_in = True
                if subbed_out_ids and pid in subbed_out_ids:
                    was_out = True
                if was_in:
                    rec["was_subbed_in"] = True
                if was_out:
                    rec["was_subbed_out"] = True

                minutes_played_current = rec.get("minutes_played")
                # Final is_substitute semantics (stricter):
                #  True  => explicit flag True OR evidence of coming on (sub_in_time / incidents set)
                #  False => otherwise (either starter or unused bench). We DO NOT infer True from minutes alone.
                if explicit_is_sub is True:
                    rec["is_substitute"] = True
                elif was_in:
                    rec["is_substitute"] = True
                else:
                    rec["is_substitute"] = False

                # If player has minutes (participated) ensure missing count stats become 0 (avoid NULL overwrites later)
                if rec.get("minutes_played") is not None and rec.get("minutes_played") > 0:
                    for k in ("goals","assists","passes","tackles","shots_total","shots_on_target","touches"):
                        if rec.get(k) is None:
                            rec[k] = 0

                # --- Anomaly detection & correction ---
                try:
                    mp = rec.get("minutes_played")
                    if isinstance(mp, (int, float)) and mp and mp > 120:
                        # Only log; do NOT modify (store what API returns)
                        _sp_logger.warning(f"[player_stats_anom] ev={event_id} pid={pid} minutes_played={mp} >120 (raw_keys={list(stats.keys())})")
                    # Passes should rarely exceed 120; touches rarely > 150; passes cannot exceed touches normally
                    ps = rec.get("passes")
                    tc = rec.get("touches")
                    if (isinstance(ps, int) and ps > 120) or (isinstance(tc, int) and tc > 180) or (isinstance(ps, int) and isinstance(tc, int) and ps > tc and tc > 0):
                        _sp_logger.warning(
                            f"[player_stats_anom] ev={event_id} pid={pid} passes={ps} touches={tc} minutes={rec.get('minutes_played')} raw_stats_subset={ {k: stats.get(k) for k in ['totalPass','accuratePass','touches','minutesPlayed']} }"
                        )
                    # Optional full raw dump for first N players if env set
                    dump_n = int(os.getenv("LOG_PLAYER_STATS_RAW_FIRST_N", "0") or 0)
                    if dump_n > 0:
                        # Use deterministic ordering by appending raw until counter reaches N per event
                        key = f"_dump_count_{event_id}"
                        already = getattr(self, key, 0)
                        if already < dump_n:
                            _sp_logger.info(f"[player_stats_raw] ev={event_id} pid={pid} raw_keys={list(stats.keys())} raw={ {k: stats.get(k) for k in stats.keys()} }")
                            setattr(self, key, already + 1)
                except Exception:
                    pass

                # Bench unused: assign 0 minutes + zeros if truly unused
                if rec.get("minutes_played") is None and not is_starting and not rec.get("was_subbed_in"):
                    rec["minutes_played"] = 0
                    if rec.get("is_substitute") is True and explicit_is_sub is None:
                        rec["is_substitute"] = False
                    for k in ("goals","assists","shots_total","shots_on_target","passes","tackles","touches"):
                        if rec.get(k) is None:
                            rec[k] = 0

                # Team id mapping passthrough
                try:
                    if team_id_map and side in team_id_map and team_id_map[side] is not None:
                        rec["team_sofascore_id"] = int(team_id_map[side])
                except Exception:
                    pass

                # Configurable log level for per-player line (default DEBUG, can elevate to INFO via env)
                try:
                    lvl = os.getenv("LOG_PLAYER_STATS_LEVEL", "DEBUG").upper()
                    msg = (
                        f"[player_stats_parse] ev={event_id} pid={pid} side={side} rating={rec.get('rating')} min={rec.get('minutes_played')} "
                        f"touches={rec.get('touches')} passes={rec.get('passes')} tackles={rec.get('tackles')} goals={rec.get('goals')} "
                        f"assists={rec.get('assists')} was_in={rec.get('was_subbed_in')} was_out={rec.get('was_subbed_out')} is_sub={rec.get('is_substitute')}"
                    )
                    if lvl == "INFO":
                        _sp_logger.info(msg)
                    elif lvl == "WARNING":
                        _sp_logger.warning(msg)
                    else:
                        _sp_logger.debug(msg)
                except Exception:
                    pass
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
