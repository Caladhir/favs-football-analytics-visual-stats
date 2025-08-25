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
    if not dt_val:
        return None
    if isinstance(dt_val, (int, float)):
        if dt_val > 10**12:
            dt_val = dt_val / 1000.0
        try:
            return datetime.utcfromtimestamp(dt_val).replace(tzinfo=timezone.utc).isoformat()
        except Exception:
            return None
    if isinstance(dt_val, str):
        try:
            return datetime.fromisoformat(dt_val.replace("Z", "+00:00")).astimezone(timezone.utc).isoformat()
        except Exception:
            return dt_val
    return None

from utils.logger import get_logger
_mp_logger = get_logger(__name__)

class MatchProcessor:
    """Transforms enriched events into a bundle (entity lists) for storage."""
    def process(self, enriched_events: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
        """Main transformation entry point."""
        competitions: Dict[int, Dict[str, Any]] = {}
        teams: Dict[int, Dict[str, Any]] = {}
        players: Dict[int, Dict[str, Any]] = {}
        matches: List[Dict[str, Any]] = []
        lineups: List[Dict[str, Any]] = []
        formations: List[Dict[str, Any]] = []
        events: List[Dict[str, Any]] = []
        player_stats: List[Dict[str, Any]] = []
        match_stats: List[Dict[str, Any]] = []
        shots: List[Dict[str, Any]] = []
        average_positions: List[Dict[str, Any]] = []
        managers: List[Dict[str, Any]] = []
        match_managers: List[Dict[str, Any]] = []
        venue_ok_count = 0
        venue_missing: List[int] = []

        for enriched in enriched_events:
            base = enriched.get("event") or enriched
            eid_raw = enriched.get("event_id") or base.get("id")
            try:
                ev_id = int(eid_raw)
            except Exception:
                continue

            # Venue debug
            try:
                raw_v = base.get("venue")
                if raw_v is None:
                    _mp_logger.debug(f"[match_processor][raw_venue_absent] ev={ev_id}")
                elif isinstance(raw_v, dict):
                    _mp_logger.debug(f"[match_processor][raw_venue_keys] ev={ev_id} keys={list(raw_v.keys())}")
            except Exception:
                pass

            comp = competition_processor.parse(base)
            if comp:
                competitions[comp["sofascore_id"]] = comp

            for t in team_processor.parse_teams(base, enriched):
                teams[t["sofascore_id"]] = t
            for p in team_processor.parse_players(enriched):
                players[p["sofascore_id"]] = p
            lineups.extend(team_processor.parse_lineups(enriched))
            formations.extend(team_processor.parse_formations(enriched))

            # Events (incidents)
            event_rows = events_processor.parse(enriched)
            events.extend(event_rows)
            sub_in_ids = {er.get("player_in_sofascore_id") for er in event_rows if er.get("event_type") == "substitution" and er.get("player_in_sofascore_id")}
            sub_out_ids = {er.get("player_out_sofascore_id") for er in event_rows if er.get("event_type") == "substitution" and er.get("player_out_sofascore_id")}

            # Status & time
            stat = status_processor.parse(base)
            try:
                raw_status_desc = (base.get("status") or {}).get("description") or (base.get("status") or {}).get("type") or base.get("statusType")
            except Exception:
                raw_status_desc = None
            date_utc = _get(base.get("startTimestamp") or base.get("startTimeUTC") or base.get("startTime"))
            home_colors = (base.get("homeTeam") or {}).get("teamColors") or {}
            away_colors = (base.get("awayTeam") or {}).get("teamColors") or {}
            home_color = home_colors.get("primary") or "#222222"
            away_color = away_colors.get("primary") or "#222222"
            current_period_start = None
            try:
                cps = (base.get("time") or {}).get("currentPeriodStartTimestamp")
                if cps:
                    current_period_start = _get(cps)
            except Exception:
                pass
            is_finished = False
            try:
                st_raw = (base.get("status") or {}).get("type") or (base.get("status") or {}).get("description") or stat.get("status")
                if st_raw and str(st_raw).lower() in {"finished","afteret","aft","ft"}:
                    is_finished = True
            except Exception:
                pass
            home_tid = enriched.get("home_team_sofa") or (base.get("homeTeam") or {}).get("id")
            away_tid = enriched.get("away_team_sofa") or (base.get("awayTeam") or {}).get("id")

            def _vn(v):
                if isinstance(v, dict):
                    return v.get("name") or (v.get("stadium") or {}).get("name") or v.get("slug")
                return None
            venue_name = _vn(base.get("venue")) or _vn((base.get("homeTeam") or {}).get("venue")) or _vn((base.get("awayTeam") or {}).get("venue"))
            if not venue_name and home_tid in teams:
                venue_name = teams[home_tid].get("venue")
            if not venue_name and away_tid in teams:
                venue_name = teams[away_tid].get("venue")
            if venue_name:
                venue_ok_count += 1
            else:
                venue_missing.append(ev_id)

            comp_name = (comp or {}).get("name")
            try:
                if (stat.get("home_score") or 0) + (stat.get("away_score") or 0) > 15:
                    from utils.logger import get_logger as _gl
                    _gl(__name__).debug(
                        f"[match_processor][score_anom] ev={ev_id} raw_homeScore={(base.get('homeScore') or {})} raw_awayScore={(base.get('awayScore') or {})}"
                    )
            except Exception:
                pass

            matches.append({
                "source": "sofascore",
                "source_event_id": ev_id,
                "start_time": date_utc,
                "status": stat["status"],
                "home_team": (base.get("homeTeam") or {}).get("name"),
                "away_team": (base.get("awayTeam") or {}).get("name"),
                "home_team_sofascore_id": home_tid,
                "away_team_sofascore_id": away_tid,
                "home_score": stat.get("home_score"),
                "away_score": stat.get("away_score"),
                "home_score_ht": stat.get("home_score_ht"),
                "away_score_ht": stat.get("away_score_ht"),
                "final_home_score": stat.get("home_score") if is_finished else None,
                "final_away_score": stat.get("away_score") if is_finished else None,
                "competition_sofascore_id": (comp or {}).get("sofascore_id"),
                "competition": comp_name,
                "round": base.get("roundInfo", {}).get("round") if isinstance(base.get("roundInfo"), dict) else base.get("round"),
                "season": (base.get("season") or {}).get("name") if isinstance(base.get("season"), dict) else base.get("season"),
                "venue": venue_name,
                "status_type": raw_status_desc,
                "home_color": home_color,
                "away_color": away_color,
                "current_period_start": current_period_start,
                "is_finished": is_finished,
            })

            # Player & match stats
            raw_lineups = enriched.get("_raw_lineups") or {}
            if raw_lineups:
                try:
                    player_stats.extend(
                        stats_processor.process_player_stats(
                            raw_lineups,
                            ev_id,
                            subbed_in_ids=sub_in_ids,
                            subbed_out_ids=sub_out_ids,
                            team_id_map={"home": home_tid, "away": away_tid},
                        )
                    )
                except Exception:
                    pass
            raw_stats = enriched.get("statistics") or enriched.get("_raw_statistics") or {}
            if raw_stats:
                try:
                    match_stats.extend(stats_processor.process_match_stats(raw_stats, ev_id))
                except Exception:
                    pass
            raw_shots = enriched.get("_raw_shots")
            if raw_shots:
                try:
                    parsed_shots = shots_processor.parse(raw_shots, ev_id)
                    # Attempt to enrich missing assist IDs for goal shots via incidents (events) map
                    try:
                        # Build local goal assist lookup: (minute, player_sofa_id) -> assist_sofa_id
                        goal_assists: Dict[tuple, int] = {}
                        for er in event_rows:
                            if er.get("event_type") in {"goal","own_goal"}:
                                ap = er.get("assist_player_sofascore_id")
                                sp = er.get("player_sofascore_id")
                                mn = er.get("minute")
                                if ap and sp and mn is not None:
                                    key = (int(mn), int(sp))
                                    # keep first (provider order) if multiple
                                    goal_assists.setdefault(key, int(ap))
                        if goal_assists:
                            patched = 0
                            fuzzy_hits = 0
                            unresolved_samples = []
                            # Precompute per-player goal assist minutes to allow fuzzy lookup if exact minute mismatch
                            per_player_minutes: Dict[int, List[int]] = {}
                            for (mn, sp), aid in goal_assists.items():
                                per_player_minutes.setdefault(sp, []).append(mn)
                            # Also keep per-player (minute, assist_id) list for distance scoring
                            per_player_pairs: Dict[int, List[tuple[int,int]]] = {}
                            for (mn, sp), aid in goal_assists.items():
                                per_player_pairs.setdefault(sp, []).append((mn, aid))
                            # Sort minutes for deterministic smallest-distance selection
                            for sp, lst in per_player_pairs.items():
                                lst.sort(key=lambda x: x[0])
                            goal_shot_candidates = 0
                            for sh in parsed_shots:
                                if sh.get("outcome") == "goal" and not sh.get("assist_player_sofascore_id"):
                                    try:
                                        sm = sh.get("minute")
                                        spid = sh.get("player_sofascore_id")
                                        if sm is None or spid is None:
                                            continue
                                        goal_shot_candidates += 1
                                        mk = (int(sm), int(spid))
                                        apid = goal_assists.get(mk)
                                        # Fuzzy minute match (+/-1) if exact not found
                                        if not apid:
                                            for delta in (-1, 1):
                                                apid = goal_assists.get((int(sm)+delta, int(spid)))
                                                if apid:
                                                    fuzzy_hits += 1
                                                    break
                                        # Wider fuzzy window (+/-2, +/-3)
                                        if not apid:
                                            for delta in (-2, 2, -3, 3):
                                                apid = goal_assists.get((int(sm)+delta, int(spid)))
                                                if apid:
                                                    fuzzy_hits += 1
                                                    break
                                        # If still not found and player has exactly one assist minute, take it (rare fallback)
                                        if not apid:
                                            mins_for_player = per_player_minutes.get(int(spid)) or []
                                            if len(mins_for_player) == 1:
                                                apid = goal_assists.get((mins_for_player[0], int(spid)))
                                        # Distance-based fallback: choose closest minute within +/-3
                                        if not apid:
                                            pairs = per_player_pairs.get(int(spid)) or []
                                            if pairs:
                                                # compute min abs distance
                                                best_pair = None
                                                best_dist = 999
                                                for (gmin, aid) in pairs:
                                                    d = abs(int(sm) - gmin)
                                                    if d < best_dist:
                                                        best_dist = d
                                                        best_pair = (gmin, aid)
                                                if best_pair and best_dist <= 3:
                                                    apid = best_pair[1]
                                                    fuzzy_hits += 1
                                        if apid:
                                            sh["assist_player_sofascore_id"] = apid
                                            patched += 1
                                        else:
                                            if len(unresolved_samples) < 5:
                                                unresolved_samples.append({
                                                    "shot_min": sm,
                                                    "player": spid,
                                                    "goal_keys_sample": list(goal_assists.keys())[:5]
                                                })
                                    except Exception:
                                        continue
                            if patched or unresolved_samples or goal_shot_candidates:
                                # Promote to INFO so it appears in normal run logs
                                _mp_logger.info(
                                    f"[match_processor][shots_assist_patch] ev={ev_id} goal_shots_without_initial_assist={goal_shot_candidates} patched={patched} fuzzy_matches={fuzzy_hits} goals_with_assist_events={len(goal_assists)} unresolved={len(unresolved_samples)} samples={unresolved_samples}"
                                )
                    except Exception:
                        pass
                    shots.extend(parsed_shots)
                except Exception:
                    pass
            raw_avg = enriched.get("_raw_avg_positions")
            if raw_avg:
                try:
                    average_positions.extend(avg_positions_processor.parse(raw_avg, ev_id))
                except Exception:
                    pass
            raw_mgrs = enriched.get("managers") or {}
            if isinstance(raw_mgrs, dict):
                try:
                    base_ev = enriched.get("event") or {}
                    home_tid2 = (base_ev.get("homeTeam") or {}).get("id")
                    away_tid2 = (base_ev.get("awayTeam") or {}).get("id")
                    for side in ("home", "away"):
                        m = raw_mgrs.get(side) or raw_mgrs.get(f"{side}Manager")
                        if isinstance(m, dict) and m.get("id"):
                            managers.append({
                                "sofascore_id": m.get("id"),
                                "full_name": m.get("name"),
                                "team_sofascore_id": home_tid2 if side == "home" else away_tid2,
                            })
                            match_managers.append({
                                "source_event_id": ev_id,
                                "manager_sofascore_id": m.get("id"),
                                "team_sofascore_id": home_tid2 if side == "home" else away_tid2,
                                "side": side,
                            })
                except Exception:
                    pass

        try:
            _mp_logger.info(
                f"[match_processor][venue_summary] resolved={venue_ok_count} missing={len(venue_missing)} total={len(enriched_events)} missing_ids={venue_missing[:10]}"
            )
        except Exception:
            pass

        return {
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
            "managers": managers,
            "match_managers": match_managers,
        }

match_processor = MatchProcessor()
