# scraper/debug_one_event.py
from __future__ import annotations

# debug_one_event.py – single-event debug & upsert runner
# - bez poziva player-statistics endpointa
# - fallback za competitions/teams/matches
# - robust shots & avg positions

import argparse
import logging
import os
import sys
import types
from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime, timezone

# ===================== PATH / ENV =====================
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
os.chdir(ROOT)

if ROOT not in sys.path:
    sys.path.insert(0, ROOT)
SCRAPER_DIR = os.path.join(ROOT, "scraper")
if SCRAPER_DIR not in sys.path:
    sys.path.insert(0, SCRAPER_DIR)

# ===================== LOGGER (fallback) =====================
try:
    from utils.logger import get_logger  # type: ignore
except Exception:
    logging.basicConfig(level=logging.INFO, format="%(message)s")

    def get_logger(name):  # type: ignore
        return logging.getLogger(name)

    utils_mod = types.ModuleType("utils")
    logger_mod = types.ModuleType("utils.logger")
    logger_mod.get_logger = get_logger  # type: ignore[attr-defined]
    utils_mod.logger = logger_mod       # type: ignore[attr-defined]
    sys.modules["utils"] = utils_mod
    sys.modules["utils.logger"] = logger_mod
    from utils.logger import get_logger  # type: ignore

logger = get_logger(__name__)

# ===================== FLEX IMPORTS =====================
try:
    from core.database import db
except ModuleNotFoundError:
    from scraper.core.database import db  # type: ignore

try:
    from core.browser import Browser as _Browser
except Exception:
    try:
        from core.browser import BrowserManager as _Browser  # type: ignore
    except Exception:
        from scraper.core.browser import Browser as _Browser  # type: ignore
Browser = _Browser

try:
    from processors.match_processor import MatchProcessor
except ModuleNotFoundError:
    from scraper.processors.match_processor import MatchProcessor  # type: ignore

# standings (opcionalno)
try:
    from processors.standings_processor import StandingsProcessor
except ModuleNotFoundError:
    from scraper.standings_processor import StandingsProcessor  # type: ignore

# ===================== CLI =====================
parser = argparse.ArgumentParser(description="Debug upsert za jedan SofaScore event")
parser.add_argument("--event", type=int, required=True, help="SofaScore event ID")
args = parser.parse_args()
EVENT_ID = int(args.event)

# ===================== HELPERS =====================
def _as_min(x):
    if isinstance(x, dict):
        for k in ("current", "minute", "min", "time"):
            if k in x:
                x = x[k]; break
    try:
        return int(x)
    except Exception:
        return None

def _event_id(ev: Dict[str, Any]) -> Optional[int]:
    for k in ("id", "eventId", "sofaEventId", "source_event_id"):
        v = ev.get(k)
        if v is not None:
            try: return int(v)
            except Exception: pass
    return None

ALLOWED_EVENT_TYPES = {
    "goal","own_goal","penalty_goal","penalty_miss",
    "yellow_card","red_card","second_yellow",
    "substitution_in","substitution_out",
    "var","kickoff","half_time","full_time","period_start","period_end"
}

def _norm_event_type(et: Optional[str], color: Optional[str] = None) -> Optional[str]:
    s = (et or "").strip().lower().replace(" ", "_")
    c = (color or "").strip().lower()
    if s in ALLOWED_EVENT_TYPES:
        return s
    if s in {"yellow","yellowcard","booking","booked"}:
        return "yellow_card"
    if s in {"red","redcard","straight_red"}:
        return "red_card"
    if s in {"secondyellow","second_yellow","2nd_yellow"}:
        return "second_yellow"
    if s in {"sub","substitution"}:
        return None
    if s == "card":
        if c.startswith("y"): return "yellow_card"
        if c.startswith("r"): return "red_card"
        return None
    if s in {"penalty", "pen"}:
        return "penalty_goal"
    return None

def _side_key(v):
    return "home" if v in ("home", 1, "1", True) else ("away" if v in ("away", 2, "2", False) else None)

ALLOWED_OUTCOMES = {
    "goal", "on_target", "off_target", "blocked", "saved", "woodwork", "saved_off_target"
}

def _to_int(v):
    if v is None: return None
    try:
        if isinstance(v, str):
            s = v.strip().replace("%", "").replace(",", "")
            return int(float(s)) if s else None
        return int(v)
    except Exception:
        return None

def _to_float(v):
    if v is None: return None
    try:
        if isinstance(v, str):
            s = v.strip().replace("%", "").replace(",", "")
            return float(s) if s else None
        return float(v)
    except Exception:
        return None

def norm_xy(x, y):
    def _n(val, pitch=None):
        if val is None:
            return None
        val = _to_float(val)
        if val is None:
            return None
        if 0.0 <= val <= 1.0:
            return val
        if 0.0 <= val <= 100.0:
            return val / 100.0
        if pitch:
            return val / pitch
        return None
    nx = _n(x, 105.0)
    ny = _n(y, 68.0)
    return nx, ny

# ===================== STAT PARSING (match / player) =====================
def _flatten_statistics(raw):
    if not isinstance(raw, dict):
        return []
    periods = raw.get("statistics")
    if isinstance(periods, dict):
        periods = [periods]
    if isinstance(periods, list) and periods:
        chosen = next((p for p in periods if str(p.get("period")).upper() == "ALL"), periods[0])
        out = []
        for g in (chosen.get("groups") or []):
            for it in (g.get("statisticsItems") or g.get("statistics") or g.get("items") or []):
                home = it.get("homeValue", it.get("home"))
                away = it.get("awayValue", it.get("away"))
                if isinstance(home, dict):
                    home = home.get("value") or home.get("total") or home.get("current") or home.get("num") or home.get("count")
                if isinstance(away, dict):
                    away = away.get("value") or away.get("total") or away.get("current") or away.get("num") or away.get("count")
                out.append({
                    "name": it.get("name"),
                    "key": it.get("key"),
                    "home": home,
                    "away": away,
                    "homeText": it.get("home"),
                    "awayText": it.get("away"),
                })
        return out

    items = []
    for g in raw.get("groups", []) or []:
        items.extend(g.get("statistics") or g.get("items") or [])
    for sec in raw.get("sections", []) or []:
        for row in sec.get("rows", []) or []:
            if "home" in row and "away" in row:
                items.append(row)
    return items

STAT_KEYS = {
    "ball possession": ("possession", "pct"),
    "possession": ("possession", "pct"),
    "total shots": ("shots_total", None),
    "shots": ("shots_total", None),
    "shots on target": ("shots_on_target", None),
    "corner kicks": ("corners", None),
    "corners": ("corners", None),
    "fouls": ("fouls", None),
    "offsides": ("offsides", None),
    "yellow cards": ("yellow_cards", None),
    "red cards": ("red_cards", None),
    "passes": ("passes", None),
    "accurate passes": ("_accurate_passes", None),
    "xg": ("xg", "float"),
    "saves": ("saves", None),
}

KEY_TO_NAME = {
    "ballpossession": "possession",
    "expectedgoals": "xg",
    "totalshotsongoal": "total shots",
    "shotsongoal": "shots on target",
    "cornerkicks": "corners",
    "fouls": "fouls",
    "passes": "passes",
    "accuratepasses": "accurate passes",
    "goalkeepersaves": "saves",
    "offsides": "offsides",
    "yellowcards": "yellow cards",
}

def _build_match_stats_from_raw(ev: Dict[str, Any]) -> List[Dict[str, Any]]:
    raw = ev.get("_raw_statistics") or {}
    stats = _flatten_statistics(raw)
    if not stats:
        logger.info("[fallback] match_stats: nema raw statistics")
        return []

    home: Dict[str, Any] = {}
    away: Dict[str, Any] = {}
    parsed_any = False

    acc_home = acc_away = None
    for s in stats:
        k = (s.get("key") or "").strip().lower().replace("_", "")
        name_from_key = KEY_TO_NAME.get(k)
        name = (name_from_key or s.get("name") or s.get("title") or s.get("type") or "").strip().lower()
        if name not in STAT_KEYS:
            continue
        key, mode = STAT_KEYS[name]
        h = s.get("home"); a = s.get("away")
        if mode == "pct": hv = _to_int(h); av = _to_int(a)
        elif mode == "float": hv = _to_float(h); av = _to_float(a)
        else: hv = _to_int(h); av = _to_int(a)

        if key == "_accurate_passes":
            acc_home = hv; acc_away = av; parsed_any = True
        else:
            if hv is not None or av is not None:
                home[key] = hv; away[key] = av; parsed_any = True

    if home.get("passes") and acc_home is not None:
        try: home["pass_accuracy"] = int(round(100 * float(acc_home) / float(home["passes"])))
        except Exception: pass
    if away.get("passes") and acc_away is not None:
        try: away["pass_accuracy"] = int(round(100 * float(acc_away) / float(away["passes"])))
        except Exception: pass

    if not parsed_any:
        return _build_match_stats_lite_from_events(ev)

    h_tid = ev.get("home_team_sofa") or ((ev.get("homeTeam") or {}).get("id"))
    a_tid = ev.get("away_team_sofa") or ((ev.get("awayTeam") or {}).get("id"))
    nowiso = datetime.now(timezone.utc).isoformat()

    out: List[Dict[str, Any]] = []
    if h_tid:
        home.update({
            "team_sofascore_id": int(h_tid),
            "updated_at": nowiso,
            "source": "sofascore",
            "source_event_id": _event_id(ev),
        }); out.append(home)
    if a_tid:
        away.update({
            "team_sofascore_id": int(a_tid),
            "updated_at": nowiso,
            "source": "sofascore",
            "source_event_id": _event_id(ev),
        }); out.append(away)

    logger.info(f"[fallback] match_stats built from raw: {out}")
    return out

def _build_match_stats_lite_from_events(ev: Dict[str, Any]) -> List[Dict[str, Any]]:
    evts = ev.get("events") or []
    if not evts:
        return []
    agg = {"home": {"yellow_cards":0,"red_cards":0},
           "away": {"yellow_cards":0,"red_cards":0}}
    for e in evts:
        side = e.get("team")
        et = _norm_event_type(e.get("type") or e.get("event_type"), e.get("card_color"))
        if side not in ("home","away") or not et:
            continue
        if et == "yellow_card": agg[side]["yellow_cards"] += 1
        elif et == "red_card": agg[side]["red_cards"] += 1
    out: List[Dict[str, Any]] = []
    for side in ("home","away"):
        tid = ev.get(f"{side}_team_sofa") or ((ev.get(f"{side}Team") or {}).get("id"))
        if not tid: continue
        r = {"team_sofascore_id": int(tid),
             "updated_at": datetime.now(timezone.utc).isoformat(),
             "source": "sofascore",
             "source_event_id": _event_id(ev)}
        r.update(agg[side]); out.append(r)
    logger.info(f"[fallback] match_stats (lite) from events: {out}")
    return out

def _build_player_stats_from_lineups_and_incidents(ev: Dict[str, Any]) -> List[Dict[str, Any]]:
    lineups = (ev.get("lineups") or {})
    incidents = ev.get("events") or []
    if not lineups:
        logger.info("[fallback] player_stats: nema lineups")
        return []

    def _name(n: Optional[str]) -> str:
        return (n or "").strip().lower()

    by_side: Dict[str, Dict[int, Dict[str, Any]]] = {"home":{}, "away":{}}
    for side in ("home","away"):
        for p in (lineups.get(side) or []):
            pobj = p.get("player") or p
            pid = pobj.get("id")
            if not pid:
                continue
            by_side[side][int(pid)] = {
                "player_sofascore_id": int(pid),
                "team_sofascore_id": int(ev.get(f"{side}_team_sofa")) if ev.get(f"{side}_team_sofa") else None,
                "goals": 0, "assists": None, "shots": None, "passes": None, "tackles": None,
                "rating": None,
                "minutes_played": None,
                "is_substitute": not bool(p.get("isStarting")),
                "was_subbed_in": False, "was_subbed_out": False,
                "source": "sofascore", "source_event_id": _event_id(ev),
                "_name": _name(pobj.get("name")),
            }

    for inc in incidents:
        side = _side_key(inc.get("isHome")) or _side_key(inc.get("team")) or _side_key(inc.get("side"))
        if side not in ("home","away"):
            continue
        m = _as_min(inc.get("time") or inc.get("minute") or (inc.get("playerOffTime") or {}).get("minute"))
        et = _norm_event_type(inc.get("incidentType") or inc.get("type"), inc.get("color") or inc.get("cardColor"))
        pname = _name((inc.get("player") or {}).get("name") or inc.get("playerName"))
        pid = None
        for cand_id, dat in by_side[side].items():
            if dat.get("_name") == pname and pname:
                pid = cand_id
                break

        if et in ("substitution_in","substitution_out"):
            if et == "substitution_in" and pid in by_side[side]:
                by_side[side][pid]["was_subbed_in"] = True
                by_side[side][pid]["is_substitute"] = True
                if m is not None:
                    by_side[side][pid].setdefault("_in_min", m)
            if et == "substitution_out" and pid in by_side[side]:
                by_side[side][pid]["was_subbed_out"] = True
                if m is not None:
                    by_side[side][pid].setdefault("_out_min", m)
        elif et in ("goal","penalty_goal","own_goal"):
            if pid in by_side[side]:
                by_side[side][pid]["goals"] = (by_side[side][pid]["goals"] or 0) + 1

    for side in ("home","away"):
        for pid, it in by_side[side].items():
            inm = it.pop("_in_min", None)
            outm = it.pop("_out_min", None)
            if inm is None and outm is None:
                it["minutes_played"] = 90 if not it["is_substitute"] else None
            elif inm is not None and outm is None:
                it["minutes_played"] = max(0, 90 - int(inm))
            elif inm is None and outm is not None:
                it["minutes_played"] = int(outm)
            else:
                it["minutes_played"] = max(0, int(outm) - int(inm))

    out: List[Dict[str, Any]] = []
    for side in ("home","away"):
        for pid, it in by_side[side].items():
            it.pop("_name", None)
            out.append(it)

    logger.info(f"[fallback] player_stats from lineups+incidents: {len(out)}")
    return out

# ===================== SHOTS (SHOTMAP) =====================
def _fetch_shotmap(b: Browser, eid: int) -> Any:
    for path in (f"event/{eid}/shotmap",):
        data = _safe_fetch(b, path)
        if data:
            return data
    return None

def _map_outcome(shot_type: str) -> str:
    s = (shot_type or "").lower().strip().replace("-", "_").replace(" ", "_")
    alias = {
        "goal":"goal","own_goal":"goal","on_target":"on_target","shot_on_target":"on_target","ontarget":"on_target",
        "off_target":"off_target","miss":"off_target","missed":"off_target","blocked":"blocked",
        "save":"saved","saved":"saved","goalkeeper_save":"saved","keeper_save":"saved",
        "woodwork":"woodwork","post":"woodwork","bar":"woodwork","hit_woodwork":"woodwork",
        "saved_off_target":"saved_off_target",
    }
    out = alias.get(s, "off_target")
    return out

def _build_shots_from_raw(ev: Dict[str, Any]) -> List[Dict[str, Any]]:
    raw = ev.get("_raw_shots")
    if not raw:
        return []
    shots = None
    if isinstance(raw, dict):
        shots = raw.get("shotmap") or raw.get("shots")
    elif isinstance(raw, list):
        shots = raw
    if not isinstance(shots, list):
        return []

    h_tid = ev.get("home_team_sofa") or ((ev.get("homeTeam") or {}).get("id"))
    a_tid = ev.get("away_team_sofa") or ((ev.get("awayTeam") or {}).get("id"))

    out: List[Dict[str, Any]] = []
    for s in shots:
        player_obj = s.get("player") or {}
        pid = player_obj.get("id") or s.get("playerId")
        side = _side_key(s.get("isHome") or s.get("team") or s.get("side"))
        team_sofa = (h_tid if side == "home" else a_tid) or s.get("teamId")

        pc = s.get("playerCoordinates") or {}
        x = _to_float(pc.get("x") if isinstance(pc, dict) else None) or _to_float(s.get("x"))
        y = _to_float(pc.get("y") if isinstance(pc, dict) else None) or _to_float(s.get("y"))

        shot_type = (s.get("shotType") or s.get("result") or "").lower()
        situation = (s.get("situation") or "").lower()
        body_part = (s.get("bodyPart") or "").lower()
        is_pen = "pen" in situation
        is_own = bool(s.get("isOwnGoal"))
        minute = _to_int(s.get("time"))
        second = _to_int(s.get("timeSeconds") or 0) 


        # normaliziraj koordinate u [0..1] ako treba
        nx, ny = norm_xy(x, y)
        
        assist_obj = (
            s.get("assist")
            or s.get("goalAssist")
            or s.get("assistPlayer")
            or s.get("lastActionPlayer")
            or {}
        )
        assist_pid = (
            assist_obj.get("id")
            or s.get("assistPlayerId")
            or s.get("lastPassPlayerId")
        )
        
        out.append({
            "player_sofascore_id": int(pid) if pid else None,
            "team_sofascore_id": int(team_sofa) if team_sofa else None,
            "minute": minute,
            "assist_player_sofascore_id": _to_int(assist_pid) if assist_pid else None,
            "second": second,
            "x": nx, "y": ny,
            "xg": _to_float(s.get("xg") or s.get("expectedGoals")),
            "body_part": body_part or None,
            "situation": situation or None,
            "outcome": _map_outcome(shot_type),
            "is_penalty": is_pen,
            "is_own_goal": is_own,
            "source": "sofascore",
            "source_event_id": _event_id(ev),
            "source_item_id": _to_int(s.get("id")),
        })

    out = [r for r in out if r.get("player_sofascore_id") and r.get("x") is not None and r.get("y") is not None and r.get("outcome") in ALLOWED_OUTCOMES]
    logger.info(f"[shots] parsed {len(out)} items from shotmap")
    return out

# ===================== AVERAGE POSITIONS =====================
def _fetch_avg_positions(b: Browser, eid: int) -> Any:
    for path in (f"event/{eid}/average-positions", f"event/{eid}/averagepositions"):
        data = _safe_fetch(b, path)
        if data:
            return data
    return None

def _fetch_summary(b: Browser, eid: int) -> Any:
    for path in (f"event/{eid}/summary",):
        data = _safe_fetch(b, path)
        if data:
            return data
    return None

def _fetch_graph(b: Browser, eid: int) -> Any:
    for path in (f"event/{eid}/graph",):
        data = _safe_fetch(b, path)
        if data:
            return data
    return None

def _fetch_season_events(b: Browser, comp_sofa: int, season_id: Optional[int]) -> Any:
    if not comp_sofa or not season_id:
        return None
    candidates = [
        f"unique-tournament/{int(comp_sofa)}/season/{int(season_id)}/events",
        f"tournament/{int(comp_sofa)}/season/{int(season_id)}/events",
        f"season/{int(season_id)}/events",
    ]
    for path in candidates:
        try:
            data = _safe_fetch(b, path)
            if data:
                return data
        except Exception:
            continue
    return None

def _deep_find_first(node: Any, keys: tuple[str, ...]) -> Optional[Dict[str, Any]]:
    """
    Deep-search a nested structure for the first dict that contains ALL provided keys.
    Returns the dict if found, else None.
    """
    try:
        if node is None:
            return None
        if isinstance(node, dict):
            if all(k in node for k in keys):
                return node
            for v in node.values():
                found = _deep_find_first(v, keys)
                if found:
                    return found
        elif isinstance(node, list):
            for it in node:
                found = _deep_find_first(it, keys)
                if found:
                    return found
    except Exception:
        return None
    return None

def _extract_comp_and_season_from_raw(ev: Dict[str, Any]) -> tuple[Optional[int], Optional[int], Optional[str]]:
    """
    Try to discover competition (unique-tournament/tournament) id and season id from any raw payload
    we have cached on the enriched event. Returns (comp_id, season_id, season_name).
    """
    # quick wins from already present ev fields
    comp_id = _to_int((ev.get("tournament") or {}).get("id"))
    season_id = _to_int((ev.get("season") or {}).get("id"))
    season_name = (ev.get("season") or {}).get("name") or (ev.get("season") or {}).get("year")
    if comp_id and season_id:
        return comp_id, season_id, season_name

    raw_keys = ("_raw_lineups", "_raw_statistics", "_raw_shots", "_raw_avg_positions", "_raw_summary", "_raw_graph")
    for key in raw_keys:
        node = ev.get(key)
        if not node:
            continue
        # frequent shapes: { uniqueTournament: { id }, season: { id, name } } or { tournament: { id } }
        ut = _deep_find_first(node, ("id",))
        if isinstance(ut, dict):
            # heuristics: if dict has nested "uniqueTournament" or "tournament", prefer those
            cand = None
            if isinstance(node, dict):
                cand = node.get("uniqueTournament") or node.get("tournament")
                if isinstance(cand, dict) and cand.get("id"):
                    comp_id = comp_id or _to_int(cand.get("id"))
            # also search deeper for explicit tournament containers
            if not comp_id:
                for container_key in ("uniqueTournament", "tournament"):
                    cont = _deep_find_first(node, (container_key,))
                    if isinstance(cont, dict):
                        inner = cont.get(container_key)
                        if isinstance(inner, dict) and inner.get("id"):
                            comp_id = _to_int(inner.get("id"))
                            break
        # season
        sdict = _deep_find_first(node, ("season",))
        if isinstance(sdict, dict):
            s = sdict.get("season") if isinstance(sdict.get("season"), dict) else sdict
            if isinstance(s, dict):
                if s.get("id") and not season_id:
                    season_id = _to_int(s.get("id"))
                if not season_name:
                    season_name = s.get("name") or s.get("year")

        if comp_id and season_id and season_name:
            break

    return comp_id, season_id, season_name

def _build_avg_positions_from_raw(ev: Dict[str, Any]) -> List[Dict[str, Any]]:
    raw = ev.get("_raw_avg_positions")
    if not raw:
        return []

    h_tid = ev.get("home_team_sofa") or ((ev.get("homeTeam") or {}).get("id"))
    a_tid = ev.get("away_team_sofa") or ((ev.get("awayTeam") or {}).get("id"))

    def _iter_side_items_from_dict(d: Dict[str, Any]):
        for side in ("home", "away"):
            side_obj = d.get(side)
            if side_obj is None:
                continue
            if isinstance(side_obj, list):
                for it in side_obj:
                    yield side, it
            elif isinstance(side_obj, dict):
                lst = side_obj.get("players") or side_obj.get("items") or side_obj.get("statistics") or []
                if isinstance(lst, list):
                    for it in lst:
                        yield side, it
        teams = d.get("teams")
        if isinstance(teams, list):
            for t in teams:
                side = _side_key(t.get("isHome")) or (t.get("side") if t.get("side") in ("home","away") else None)
                lst = (t.get("players") or t.get("items") or [])
                if side and isinstance(lst, list):
                    for it in lst:
                        yield side, it
        for key in ("players", "items", "statistics"):
            lst = d.get(key)
            if isinstance(lst, list):
                for it in lst:
                    side = _side_key(it.get("isHome")) or (it.get("team") if it.get("team") in ("home","away") else None)
                    yield side, it

    def _iter_all():
        if isinstance(raw, dict):
            yield from _iter_side_items_from_dict(raw)
        elif isinstance(raw, list):
            for it in raw:
                side = _side_key(it.get("isHome")) or (it.get("side") if it.get("side") in ("home","away") else None)
                yield side, it

    out: List[Dict[str, Any]] = []
    for side, it in _iter_all():
        side = side or _side_key(it.get("isHome")) or (it.get("team") if it.get("team") in ("home","away") else None)
        if side not in ("home","away"):
            continue

        pobj = it.get("player") or it
        pid = pobj.get("id") or it.get("playerId")
        if not pid:
            continue

        x = _to_float(it.get("x") or it.get("avgX") or it.get("averageX") or (it.get("position") or {}).get("x"))
        y = _to_float(it.get("y") or it.get("avgY") or it.get("averageY") or (it.get("position") or {}).get("y"))

        nx, ny = norm_xy(x, y)

        out.append({
            "player_sofascore_id": int(pid),
            "team_sofascore_id": int(h_tid if side == "home" else a_tid) if (h_tid or a_tid) else None,
            "avg_x": nx, "avg_y": ny,
            "touches": _to_int(it.get("touches")),
            "minutes_played": _to_int(it.get("minutes") or it.get("minutesPlayed")),
            "source": "sofascore",
            "source_event_id": _event_id(ev),
        })

    logger.info(f"[avg_positions] parsed {len(out)} items")
    return out

# ===================== STANDINGS FETCHER =====================
def _fetch_standings(b: Browser, comp_sofa: int, season_id: Optional[int]) -> Any:
    cands = []
    if season_id:
        cands += [
            # Prefer explicit total table for league standings
            f"unique-tournament/{comp_sofa}/season/{season_id}/standings/total",
            f"tournament/{comp_sofa}/season/{season_id}/standings/total",
            f"unique-tournament/{comp_sofa}/season/{season_id}/standings",
            f"tournament/{comp_sofa}/season/{season_id}/standings",
            f"season/{season_id}/standings",
        ]
    cands += [
        f"unique-tournament/{comp_sofa}/standings/total",
        f"tournament/{comp_sofa}/standings/total",
        f"unique-tournament/{comp_sofa}/standings",
        f"tournament/{comp_sofa}/standings",
    ]
    for p in cands:
        data = _safe_fetch(b, p)
        if data:
            return data
    return None

# ===================== FETCHERS =====================
def _safe_fetch(b: Browser, path: str):
    try:
        if hasattr(b, "fetch_data"):
            logger.info(f"[fetch] {path}")
            return b.fetch_data(path)
        else:
            logger.info(f"[fetch(get_json)] {path}")
            return b.get_json(path)
    except Exception as ex:
        logger.info(f"[fetch] {path} failed: {ex}")
        return None

def _pack_status(ej: Dict[str, Any]) -> str:
    st = ((ej.get("status") or {}).get("type") or ej.get("statusType") or "").lower()
    m = {
        "finished":"finished", "afterextra":"finished", "afterpenalties":"finished",
        "inprogress":"live", "live":"live",
        "notstarted":"upcoming", "postponed":"postponed", "suspended":"suspended",
        "cancelled":"canceled", "abandoned":"abandoned",
        "halftime":"ht", "fulltime":"ft"
    }
    return m.get(st, "upcoming")

def _compute_score_from_events(ev: Dict[str, Any]) -> Tuple[Optional[int], Optional[int]]:
    evts = ev.get("events") or []
    if not isinstance(evts, list) or not evts:
        return None, None
    h = a = 0
    for e in evts:
        side = e.get("team") or e.get("side")
        et = _norm_event_type(e.get("type") or e.get("event_type"), e.get("card_color") or e.get("color"))
        if not et:
            continue
        if et in ("goal", "penalty_goal"):
            if side == "home": h += 1
            elif side == "away": a += 1
        elif et == "own_goal":
            if side == "home": a += 1
            elif side == "away": h += 1
    return (h if (h or a) else None), (a if (h or a) else None)

def _infer_status(ev: Dict[str, Any]) -> str:
    st = _pack_status(ev)
    if st and st != "upcoming":
        return st
    # If we have rich statistics or average positions, it's almost certainly finished.
    raw_stats = ev.get("_raw_statistics") or {}
    if isinstance(raw_stats, dict) and (raw_stats.get("statistics") or raw_stats.get("groups") or raw_stats.get("sections")):
        return "finished"
    # If events show minutes >= 90 or include full_time markers, mark finished
    evts = ev.get("events") or []
    max_min = 0
    has_ft = False
    for e in evts:
        m = _as_min(e.get("minute"))
        if isinstance(m, int):
            max_min = max(max_min, m)
        et = _norm_event_type(e.get("type") or e.get("event_type"), e.get("card_color") or e.get("color"))
        if et == "full_time":
            has_ft = True
    if has_ft or max_min >= 90:
        return "finished"
    # If lineups exist but no kickoff yet
    if (ev.get("lineups") or {}).get("home") or (ev.get("lineups") or {}).get("away"):
        return st or "upcoming"
    return st or "upcoming"

def _find_start_ts(ev: Dict[str, Any]) -> Optional[str]:
    # Preferred
    ts = ev.get("startTimestamp")
    def _norm(tsv):
        if tsv is None:
            return None
        try:
            val = int(tsv)
            if val > 10**12:
                val = val // 1000
            if val > 10**9:  # plausible unix seconds
                return datetime.fromtimestamp(val, tz=timezone.utc).isoformat()
        except Exception:
            return None
        return None
    out = _norm(ts)
    if out:
        return out
    # helper: deep search for plausible unix timestamps in nested structures
    def _deep_find_ts(node: Any) -> Optional[str]:
        try:
            if node is None:
                return None
            if isinstance(node, dict):
                # direct keys
                for k in ("startTimestamp", "startTime", "kickoff", "matchStart", "timestamp"):
                    if k in node:
                        iso = _norm(node.get(k))
                        if iso:
                            return iso
                # nested dicts/lists
                for v in node.values():
                    iso = _deep_find_ts(v)
                    if iso:
                        return iso
            elif isinstance(node, list):
                for item in node:
                    iso = _deep_find_ts(item)
                    if iso:
                        return iso
            else:
                # raw scalar that might be a timestamp
                iso = _norm(node)
                if iso:
                    return iso
        except Exception:
            return None
        return None

    # Search known raw payloads for timestamp-like fields
    for key in ("_raw_lineups", "_raw_statistics", "_raw_shots", "_raw_avg_positions", "_raw_summary", "_raw_graph"):
        node = ev.get(key)
        if not isinstance(node, dict):
            continue
        iso = _deep_find_ts(node)
        if iso:
            return iso
    # Season events payload is often a list under 'events'; find our event id
    sed = ev.get("_raw_season_events")
    if isinstance(sed, dict):
        ev_id = _to_int(_event_id(ev))
        events = sed.get("events")
        if isinstance(events, list) and ev_id:
            for item in events:
                if not isinstance(item, dict):
                    continue
                if _to_int(item.get("id")) == ev_id:
                    iso = _deep_find_ts(item)
                    if iso:
                        return iso
    # last resort: deep search the enriched event
    iso = _deep_find_ts(ev)
    if iso:
        return iso
    return None

def _extract_round_label(ev: Dict[str, Any]) -> Optional[str]:
    """
    Try to extract a human-friendly round label. Priority:
    1) Previously set _round_label
    2) roundInfo.name or roundName
    3) numeric round -> format per competition (GW{n} for Premier League)
    4) deep-search raw payloads for round info
    """
    # quick wins
    if isinstance(ev.get("_round_label"), str) and ev.get("_round_label").strip():
        return ev.get("_round_label").strip()

    rinfo = ev.get("roundInfo") or {}
    if isinstance(rinfo, dict):
        nm = rinfo.get("name")
        if isinstance(nm, str) and nm.strip():
            return nm.strip()

    # number to label
    comp_name = ((ev.get("tournament") or {}).get("name") or "").lower()
    # also use competition id hint when available (Premier League uniqueTournament id = 17)
    comp_hint = None
    try:
        comp_hint = ev.get("_comp_sofa") or ((ev.get("tournament") or {}).get("uniqueTournament") or {}).get("id") or (ev.get("tournament") or {}).get("id")
    except Exception:
        comp_hint = None
    is_premier_league = ("premier league" in comp_name) or (str(comp_hint).strip() == "17")
    def to_label(n: Optional[int]) -> Optional[str]:
        if n is None:
            return None
        if is_premier_league or "epl" in comp_name:
            return f"GW{n}"
        return f"Round {n}"

    rnum = ev.get("round")
    try:
        rnum_i = int(str(rnum)) if rnum is not None else None
    except Exception:
        rnum_i = None
    lbl = to_label(rnum_i)
    if lbl:
        return lbl

    # Deep search round info in raw payloads
    def _deep_find_round(node: Any) -> tuple[Optional[str], Optional[int]]:
        try:
            if node is None:
                return (None, None)
            if isinstance(node, dict):
                # direct hit
                if isinstance(node.get("roundInfo"), dict):
                    nm = node["roundInfo"].get("name")
                    val = node["roundInfo"].get("round")
                    try:
                        val = int(val) if val is not None else None
                    except Exception:
                        val = None
                    if nm or val is not None:
                        return (nm, val)
                # alt keys
                cand_nm = node.get("roundName") or node.get("name") if str(node.get("type") or "").lower() == "round" else None
                cand_num = node.get("round")
                try:
                    cand_num = int(cand_num) if cand_num is not None else None
                except Exception:
                    cand_num = None
                if cand_nm or cand_num is not None:
                    return (cand_nm, cand_num)
                for v in node.values():
                    nm, val = _deep_find_round(v)
                    if nm or val is not None:
                        return (nm, val)
            elif isinstance(node, list):
                for it in node:
                    nm, val = _deep_find_round(it)
                    if nm or val is not None:
                        return (nm, val)
        except Exception:
            return (None, None)
        return (None, None)

    for key in ("_raw_season_events", "_raw_summary", "_raw_graph"):
        node = ev.get(key)
        if node:
            nm, val = _deep_find_round(node)
            if nm and isinstance(nm, str) and nm.strip():
                return nm.strip()
            if val is not None:
                return to_label(val)
    return None

def _enrich_one(ev: Dict[str, Any]) -> Dict[str, Any]:
    b = Browser()
    eid = _event_id(ev)
    if not eid:
        return ev
    try:
        # CORE EVENT
        ej_raw = _safe_fetch(b, f"event/{eid}") or {}
        ej = ej_raw.get("event") if isinstance(ej_raw, dict) and isinstance(ej_raw.get("event"), dict) else ej_raw
        for k in ("homeTeam", "awayTeam", "tournament", "season", "status", "homeScore", "awayScore", "startTimestamp", "venue", "round", "roundInfo"):
            if isinstance(ej, dict) and ej.get(k) is not None:
                ev[k] = ej.get(k)
        try:
            ht = (ev.get("homeTeam") or {})
            at = (ev.get("awayTeam") or {})
            logger.info(f"[event] homeTeam.id={ht.get('id')} name={ht.get('name')} | awayTeam.id={at.get('id')} name={at.get('name')}")
        except Exception:
            pass

        # LINEUPS
        lj = _safe_fetch(b, f"event/{eid}/lineups") or {}
        ev["_raw_lineups"] = lj
        home_side = lj.get("home") or lj.get("homeTeam") or {}
        away_side = lj.get("away") or lj.get("awayTeam") or {}

        def _pluck_players(side_obj):
            players = side_obj or {}
            players = players.get("players") if isinstance(players, dict) else players
            if not isinstance(players, list):
                return []
            out = []
            for p in players:
                pobj = p.get("player") or p
                out.append({
                    "player": {"id": pobj.get("id"), "name": pobj.get("name")},
                    "jerseyNumber": p.get("jerseyNumber") or p.get("shirtNumber") or p.get("number"),
                    "position": p.get("position"),
                    "isCaptain": bool(p.get("isCaptain")),
                    "isStarting": bool(p.get("isStarting")) or (p.get("playerType") == "starting"),
                })
            return out

        ev["lineups"] = {"home": _pluck_players(home_side), "away": _pluck_players(away_side)}

        def _extract_formations(raw: Dict[str, Any]) -> tuple[Optional[str], Optional[str]]:
            h = (home_side.get("formation") if isinstance(home_side, dict) else None) or raw.get("homeFormation")
            a = (away_side.get("formation") if isinstance(away_side, dict) else None) or raw.get("awayFormation")
            if (h and a) or not isinstance(raw, dict):
                return h, a
            teams = raw.get("teams") or raw.get("lineups")
            if isinstance(teams, list):
                for t in teams:
                    if not isinstance(t, dict):
                        continue
                    is_home = t.get("isHome")
                    form = t.get("formation") or (t.get("team") or {}).get("formation")
                    if is_home is True and not h:
                        h = form
                    elif is_home is False and not a:
                        a = form
            return h, a

        hf, af = _extract_formations(lj)
        ev["homeFormation"], ev["awayFormation"] = hf, af
        try:
            lkeys = list(lj.keys()) if isinstance(lj, dict) else type(lj).__name__
        except Exception:
            lkeys = "?"
        logger.info(f"[lineups] shape={lkeys} -> formations: home={hf} away={af}")

        # team sofascore id-jevi (i fallback ime/shortName)
        def _ensure_team(side: str, side_obj: Dict[str, Any]):
            team = (side_obj.get("team") or {}) if isinstance(side_obj, dict) else {}
            if not isinstance(ev.get(f"{side}Team"), dict):
                ev[f"{side}Team"] = team or {}
            ev[f"{side}_team_sofa"] = (team.get("id") or (ev.get(f"{side}Team") or {}).get("id"))
            if ev.get(f"{side}Team") is not None:
                if not ev[f"{side}Team"].get("name") and team.get("name"):
                    ev[f"{side}Team"]["name"] = team.get("name")
                if not ev[f"{side}Team"].get("shortName") and team.get("shortName"):
                    ev[f"{side}Team"]["shortName"] = team.get("shortName")

        _ensure_team("home", home_side)
        _ensure_team("away", away_side)

        # Derive team ids from teams list if still missing
        if (not ev.get("home_team_sofa") or not ((ev.get("homeTeam") or {}).get("id"))) and isinstance(lj, dict):
            teams_list = lj.get("teams") or lj.get("lineups")
            if isinstance(teams_list, list):
                for t in teams_list:
                    try:
                        is_home = t.get("isHome")
                        team_obj = t.get("team") or {}
                        tid = team_obj.get("id")
                        if is_home is True and tid:
                            ev["home_team_sofa"] = tid
                            ev["homeTeam"] = (ev.get("homeTeam") or {})
                            ev["homeTeam"].update({k: v for k, v in team_obj.items() if k in ("id", "name", "shortName", "country", "slug", "logo", "crest")})
                        elif is_home is False and tid:
                            ev["away_team_sofa"] = tid
                            ev["awayTeam"] = (ev.get("awayTeam") or {})
                            ev["awayTeam"].update({k: v for k, v in team_obj.items() if k in ("id", "name", "shortName", "country", "slug", "logo", "crest")})
                    except Exception:
                        continue

        # Enrich team details from SofaScore team/{id} if names are missing
        def _ensure_team_details(side: str):
            try:
                tid = ev.get(f"{side}_team_sofa") or ((ev.get(f"{side}Team") or {}).get("id"))
                if not tid:
                    return
                tcur = (ev.get(f"{side}Team") or {})
                name_ok = isinstance(tcur.get("name"), str) and bool((tcur.get("name") or "").strip())
                short_ok = isinstance(tcur.get("shortName"), str) and bool((tcur.get("shortName") or "").strip())
                country_ok = bool((tcur.get("country") or {}).get("name")) if isinstance(tcur.get("country"), dict) else False
                logo_ok = bool(tcur.get("logo") or tcur.get("crest"))
                if name_ok and short_ok and country_ok and logo_ok:
                    pass  # still check venue below
                tj = _safe_fetch(b, f"team/{int(tid)}") or {}
                node = tj.get("team") if isinstance(tj.get("team"), dict) else tj
                if isinstance(node, dict) and (node.get("name") or node.get("shortName")):
                    tcur = ev.setdefault(f"{side}Team", tcur)
                    if node.get("name"):
                        tcur["name"] = node.get("name")
                    if node.get("shortName"):
                        tcur["shortName"] = node.get("shortName")
                    ctry = node.get("country")
                    if isinstance(ctry, dict) and ctry.get("name"):
                        tcur["country"] = {"name": ctry.get("name")}
                    for key in ("logo", "crest", "teamLogo", "image"):
                        if node.get(key):
                            tcur.setdefault("logo", node.get(key))
                            break
                    # Try to discover venue name from team details
                    vname = None
                    try:
                        vname = (
                            ((node.get("venue") or {}).get("name"))
                            or ((node.get("stadium") or {}).get("name"))
                            or ((node.get("homeVenue") or {}).get("name"))
                            or node.get("venueName")
                            or node.get("stadiumName")
                            or node.get("ground")
                            or node.get("homeStadium")
                        )
                    except Exception:
                        vname = None
                    # Minimal known fallback for Wolves
                    if not vname and int(tid) == 3 and side == "home":
                        vname = "Molineux Stadium"
                    if vname and not ((ev.get("venue") or {}).get("name")):
                        ev["venue"] = {"name": vname}
            except Exception:
                pass

        _ensure_team_details("home")
        _ensure_team_details("away")

        # Fallback: derive team IDs from players' teamId per side if still missing
        if isinstance(lj, dict) and (not ev.get("home_team_sofa") or not ev.get("away_team_sofa")):
            try:
                for side in ("home", "away"):
                    if ev.get(f"{side}_team_sofa"):
                        continue
                    sobj = lj.get(side) or {}
                    players = sobj.get("players") or []
                    tid = None
                    for p in players:
                        tid = p.get("teamId") or (p.get("team") or {}).get("id")
                        if tid:
                            break
                    if tid:
                        ev[f"{side}_team_sofa"] = tid
                        ev[f"{side}Team"] = (ev.get(f"{side}Team") or {})
                        if not ev[f"{side}Team"].get("id"):
                            ev[f"{side}Team"]["id"] = tid
            except Exception:
                pass

        # After deriving team IDs from players, try enriching details again to get real names
        _ensure_team_details("home")
        _ensure_team_details("away")

        # MANAGERS
        mgrs = _safe_fetch(b, f"event/{eid}/managers") or {}
        def _pick_manager(obj):
            if not obj:
                return None
            m = obj.get("manager") or obj.get("coach") or obj
            if isinstance(m, dict) and (m.get("id") or m.get("name")):
                return {"id": m.get("id"), "name": m.get("name")}
            return None
        home_mgr = mgrs.get("home") or mgrs.get("homeManager") or mgrs.get("home_manager")
        away_mgr = mgrs.get("away") or mgrs.get("awayManager") or mgrs.get("away_manager")
        ev["coaches"] = {"home": _pick_manager(home_mgr), "away": _pick_manager(away_mgr)}
        logger.info(f"[coaches] home={ev['coaches']['home']} away={ev['coaches']['away']}")

        # STATISTICS (raw)
        sj = _safe_fetch(b, f"event/{eid}/statistics") or {}
        ev["_raw_statistics"] = sj or {}

        # INCIDENTS / TIMELINE
        tj = _safe_fetch(b, f"event/{eid}/incidents") or {}
        incidents = tj.get("incidents") or tj.get("events") or []
        evts = []
        for inc in incidents:
            team_side = _side_key(inc.get("isHome")) or _side_key(inc.get("team")) or _side_key(inc.get("side"))
            if not team_side:
                continue
            evts.append({
                "minute": _as_min(inc.get("time") or inc.get("minute") or (inc.get("playerOffTime") or {}).get("minute")),
                "type": (inc.get("incidentType") or inc.get("type") or "event"),
                "player_name": (inc.get("player") or {}).get("name") or inc.get("playerName"),
                "team": team_side,
                "description": inc.get("text") or inc.get("description"),
                "card_color": (inc.get("color") or inc.get("card") or inc.get("cardColor")),
            })
        if evts:
            ev["events"] = evts

        # No player-statistics endpoint
        ev["_raw_player_stats"] = {}

        # SHOTMAP (raw)
        sm = _fetch_shotmap(b, eid) or {}
        ev["_raw_shots"] = sm or {}
        if sm:
            logger.info("[shotmap] pronađen raw payload")

        # AVERAGE POSITIONS (raw)
        ap = _fetch_avg_positions(b, eid) or {}
        ev["_raw_avg_positions"] = ap or {}
        if ap:
            logger.info("[avg-positions] pronađen raw payload")

        # SUMMARY (raw)
        smry = _fetch_summary(b, eid) or {}
        ev["_raw_summary"] = smry or {}
        if smry:
            logger.info("[summary] pronađen raw payload")

        # GRAPH (raw)
        graph = _fetch_graph(b, eid) or {}
        ev["_raw_graph"] = graph or {}
        if graph:
            logger.info("[graph] pronađen raw payload")

        # STANDINGS hintovi (za kasnije)
        tourn = (ev.get("tournament") or (ej.get("tournament") if isinstance(ej, dict) else {}) or {})
        season = (ev.get("season") or (ej.get("season") if isinstance(ej, dict) else {}) or {})
        # Prefer uniqueTournament.id when available
        try:
            ut = tourn.get("uniqueTournament") or {}
        except Exception:
            ut = {}
        ev["_comp_sofa"] = (ut.get("id") or tourn.get("id"))
        ev["_season_id"] = season.get("id")
        ev["_season_str"] = season.get("name") or season.get("year") or None
        # If core payload had no season object, create a minimal season dict so downstream uses it
        if not ev.get("season") and ev.get("_season_str"):
            ev["season"] = {"name": ev["_season_str"]}

        # Try to extract comp/season from raw payloads if core didn't have them
        if not ev.get("_comp_sofa") or not ev.get("_season_id"):
            try:
                comp_id2, season_id2, season_name2 = _extract_comp_and_season_from_raw(ev)
                if comp_id2 and not ev.get("_comp_sofa"):
                    ev["_comp_sofa"] = comp_id2
                if season_id2 and not ev.get("_season_id"):
                    ev["_season_id"] = season_id2
                if season_name2 and not ev.get("_season_str"):
                    ev["_season_str"] = season_name2
                    ev.setdefault("season", {"name": season_name2})
            except Exception:
                pass

        # Try season schedule to locate event kickoff if missing in core
        try:
            comp_sofa = _to_int(ev.get("_comp_sofa"))
            season_id = _to_int(ev.get("_season_id"))
            if comp_sofa and season_id:
                sed = _fetch_season_events(b, comp_sofa, season_id) or {}
                ev["_raw_season_events"] = sed or {}
                if sed:
                    logger.info("[season-events] pronađen raw payload")
                    # Try to extract startTimestamp/round for this event from the season events list
                    events = sed.get("events")
                    ev_id = _to_int(_event_id(ev))
                    if isinstance(events, list) and ev_id:
                        for it in events:
                            if not isinstance(it, dict):
                                continue
                            if _to_int(it.get("id")) == ev_id:
                                # fill in missing fields
                                if ev.get("startTimestamp") is None and it.get("startTimestamp") is not None:
                                    ev["startTimestamp"] = it.get("startTimestamp")
                                # round can be nested under roundInfo.round or directly round
                                rinfo = it.get("roundInfo") or {}
                                # numeric round
                                rnum = rinfo.get("round") or it.get("round")
                                if ev.get("round") is None and rnum is not None:
                                    ev["round"] = rnum
                                # copy roundInfo into ev for other consumers
                                if not ev.get("roundInfo") and isinstance(rinfo, dict):
                                    ev["roundInfo"] = rinfo
                                # friendly round label
                                rname = rinfo.get("name") or it.get("roundName")
                                comp_name = ((ev.get("tournament") or {}).get("name") or "").lower()
                                if rname:
                                    ev["_round_label"] = str(rname)
                                elif isinstance(rnum, (int, str)):
                                    try:
                                        rn = int(str(rnum))
                                    except Exception:
                                        rn = None
                                    if rn is not None:
                                        if "premier league" in comp_name or "epl" in comp_name:
                                            ev["_round_label"] = f"GW{rn}"
                                        else:
                                            ev["_round_label"] = f"Round {rn}"
                                break
                        # If still no numeric round, compute GW index by distinct match dates
                        if ev.get("round") is None:
                            try:
                                # build ordered unique list of dates in this season schedule
                                dates = []
                                for it in events:
                                    if not isinstance(it, dict):
                                        continue
                                    ts = it.get("startTimestamp")
                                    if ts is None:
                                        continue
                                    val = int(ts)
                                    if val > 10**12:
                                        val //= 1000
                                    if val > 10**9:
                                        d = datetime.fromtimestamp(val, tz=timezone.utc).date().isoformat()
                                        dates.append(d)
                                order = sorted(set(dates))
                                my_ts = ev.get("startTimestamp")
                                if my_ts is not None:
                                    v = int(my_ts)
                                    if v > 10**12:
                                        v //= 1000
                                    d = datetime.fromtimestamp(v, tz=timezone.utc).date().isoformat()
                                    if d in order:
                                        ev["round"] = order.index(d) + 1
                                        ev["_round_label"] = f"GW{ev['round']}"
                            except Exception:
                                pass
        except Exception:
            pass

        return ev
    finally:
        try:
            b.close()
        except Exception:
            pass

# ===================== MAIN =====================
def main():
    logger.info(f"[debug_one_event] Target event: {EVENT_ID}")

    # DB health
    db.health_check()
    db.performance_check()

    # ne tražimo po 'today'; direktno enrich na bazu event_id
    base = {"id": EVENT_ID, "source": "sofascore"}
    enriched = _enrich_one(base)

    # process
    mp = MatchProcessor()
    bundle = mp.process([enriched])

    comps = bundle["competitions"]
    teams = bundle["teams"]
    players = bundle["players"]
    matches = bundle["matches"]
    lineups_temp = bundle["lineups"]
    formations_temp = bundle["formations"]
    events_temp = bundle["events"]
    pstats_temp = bundle["player_stats"]
    mstats_temp = bundle["match_stats"]

    # Fallbacks (player & match stats)
    if not pstats_temp:
        pstats_temp = _build_player_stats_from_lineups_and_incidents(enriched)
    if not mstats_temp:
        mstats_temp = _build_match_stats_from_raw(enriched)
        if not mstats_temp:
            mstats_temp = _build_match_stats_lite_from_events(enriched)

    # NEW: shots + avg positions from raw
    shots_temp = _build_shots_from_raw(enriched)
    avgpos_temp = _build_avg_positions_from_raw(enriched)

    # If match_stats still empty, derive minimal team stats directly from shots
    # Aggregate by team_sofascore_id (works even if event payload lacks home/away ids)
    if not mstats_temp and shots_temp:
        agg_by_team: Dict[int, Dict[str, Any]] = {}
        for s in shots_temp:
            team_sofa = _to_int(s.get("team_sofascore_id"))
            if not team_sofa:
                continue
            bucket = agg_by_team.setdefault(team_sofa, {"shots_total": 0, "shots_on_target": 0, "xg": 0.0})
            bucket["shots_total"] += 1
            if s.get("outcome") in ("goal", "on_target", "saved"):
                bucket["shots_on_target"] += 1
            xg_val = _to_float(s.get("xg"))
            if xg_val is not None:
                bucket["xg"] = (bucket["xg"] or 0.0) + float(xg_val)
        built = []
        nowiso = datetime.now(timezone.utc).isoformat()
        for team_sofa, vals in agg_by_team.items():
            row = {
                "source": "sofascore",
                "source_event_id": EVENT_ID,
                "team_sofascore_id": int(team_sofa),
                "updated_at": nowiso,
            }
            row.update(vals)
            built.append(row)
        if built:
            mstats_temp = built

    # --------- Fallback za competitions/teams/matches ako su prazni ---------
    # competitions
    if not comps:
        t = enriched.get("tournament") or {}
        comp_id = None
        comp_name = None
        comp_country = None
        if isinstance(t, dict):
            comp_id = _to_int(t.get("id"))
            comp_name = t.get("name") or t.get("slug")
            comp_country = (t.get("country") or {}).get("name")
        # ako nema tournament objekta, pokušaj iz hidden polja _comp_sofa
        if not comp_id:
            comp_id = _to_int(enriched.get("_comp_sofa"))
        # sintetiziraj naziv ako i dalje fali
        if not comp_name:
            # ako event ima oznaku friendly, nazovi ga "Friendly" inače generički
            comp_name = (t.get("name") if isinstance(t, dict) else None) or "Friendly"
        if comp_id or comp_name:
            comps = [{
                "sofascore_id": comp_id,
                "name": comp_name,
                "country": comp_country,
                "source": "sofascore",
            }]

    # teams
    def _team_from(side: str) -> Optional[Dict[str, Any]]:
        obj = enriched.get(f"{side}Team")
        sid = None
        nm = None
        short = None
        country = None
        logo = None
        if isinstance(obj, dict):
            sid = obj.get("id")
            nm = obj.get("name") or obj.get("teamName") or obj.get("shortName")
            short = obj.get("shortName")
            country = ((obj.get("country") or {}) or {}).get("name")
            logo = obj.get("logo") or obj.get("crest")
        # fallback to enriched side sofascore id even if obj isn't a dict
        sid = sid or enriched.get(f"{side}_team_sofa")
        # If name still missing, try to extract from raw lineups payload
        if (not nm) and sid:
            rl = enriched.get("_raw_lineups") or {}
            if isinstance(rl, dict):
                try:
                    # direct side object
                    sobj = rl.get(side) or {}
                    tobj = (sobj.get("team") or {}) if isinstance(sobj, dict) else {}
                    if _to_int(tobj.get("id")) == _to_int(sid):
                        nm = nm or tobj.get("name") or tobj.get("teamName") or tobj.get("shortName")
                        short = short or tobj.get("shortName")
                        if not country and isinstance(tobj.get("country"), dict):
                            country = tobj.get("country", {}).get("name")
                        logo = logo or tobj.get("logo") or tobj.get("crest")
                except Exception:
                    pass
                # teams list variant
                tlist = rl.get("teams") or rl.get("lineups")
                if isinstance(tlist, list) and not nm:
                    for t in tlist:
                        try:
                            tobj = (t.get("team") or {})
                            if _to_int(tobj.get("id")) == _to_int(sid):
                                nm = nm or tobj.get("name") or tobj.get("teamName") or tobj.get("shortName")
                                short = short or tobj.get("shortName")
                                if not country and isinstance(tobj.get("country"), dict):
                                    country = tobj.get("country", {}).get("name")
                                logo = logo or tobj.get("logo") or tobj.get("crest")
                                break
                        except Exception:
                            continue
        if not sid and not nm:
            return None
        return {
            "sofascore_id": _to_int(sid),
            # Ensure a non-empty name, prefer SofaScore exact
            "name": (nm if (isinstance(nm, str) and nm.strip()) else (f"Team {int(sid)}" if sid else f"{side.title()} Team")),
            "short_name": (short if (isinstance(short, str) and short.strip()) else None),
            "country": country,
            "logo_url": logo,
            "source": "sofascore",
        }
    # Always prepare minimal teams from enriched as a safety net
    min_h_id = _to_int((enriched.get("homeTeam") or {}).get("id") or enriched.get("home_team_sofa"))
    min_a_id = _to_int((enriched.get("awayTeam") or {}).get("id") or enriched.get("away_team_sofa"))
    min_h_name = ((enriched.get("homeTeam") or {}).get("name")) or "Home Team"
    min_a_name = ((enriched.get("awayTeam") or {}).get("name")) or "Away Team"
    minimal_teams: List[Dict[str, Any]] = []
    if min_h_id:
        minimal_teams.append({"sofascore_id": min_h_id, "name": min_h_name})
    if min_a_id:
        minimal_teams.append({"sofascore_id": min_a_id, "name": min_a_name})

    if not teams:
        h = _team_from("home"); a = _team_from("away")
        teams = [x for x in (h, a) if x]
        # Ako i dalje prazno, sintetiziraj timove iz lineups/shotmap IDs
        if not teams:
            seen: dict[int, dict] = {}
            # pokušaj izvući ID-jeve timova iz lineups i shots
            for src in (lineups_temp or []):
                sid = _to_int(src.get("team_sofascore_id"))
                if sid and sid not in seen:
                    seen[sid] = {"sofascore_id": sid}
            for src in (shots_temp or []):
                sid = _to_int(src.get("team_sofascore_id"))
                if sid and sid not in seen:
                    seen[sid] = {"sofascore_id": sid}
            for src in (formations_temp or []):
                sid = _to_int(src.get("team_sofascore_id"))
                if sid and sid not in seen:
                    seen[sid] = {"sofascore_id": sid}
            # ekstra fallback: raw lineups -> home/away.team
            rl = enriched.get("_raw_lineups") or {}
            if isinstance(rl, dict):
                for side in ("home", "away"):
                    sobj = rl.get(side) or {}
                    tobj = sobj.get("team") or {}
                    sid = _to_int(tobj.get("id"))
                    if sid and sid not in seen:
                        seen[sid] = {"sofascore_id": sid, "name": tobj.get("name") or tobj.get("shortName")}
                # also support 'teams' list variant
                tlist = rl.get("teams") or rl.get("lineups")
                if isinstance(tlist, list):
                    for t in tlist:
                        try:
                            tobj = (t.get("team") or {})
                            sid = _to_int(tobj.get("id"))
                            if sid and sid not in seen:
                                seen[sid] = {"sofascore_id": sid, "name": tobj.get("name") or tobj.get("shortName")}
                        except Exception:
                            continue
                # or infer from players[].teamId if team object missing
                for side in ("home", "away"):
                    sobj = rl.get(side) or {}
                    for p in (sobj.get("players") or []):
                        sid = _to_int(p.get("teamId") or (p.get("team") or {}).get("id"))
                        if sid and sid not in seen:
                            seen[sid] = {"sofascore_id": sid}
            # imena iz enriched home/away ako se poklapa ID
            h_obj = (enriched.get("homeTeam") or {})
            a_obj = (enriched.get("awayTeam") or {})
            h_sid = _to_int(h_obj.get("id") or enriched.get("home_team_sofa"))
            a_sid = _to_int(a_obj.get("id") or enriched.get("away_team_sofa"))
            for sid, row in list(seen.items()):
                if sid == h_sid:
                    row["name"] = h_obj.get("name") or h_obj.get("teamName") or "Home Team"
                    row["short_name"] = h_obj.get("shortName")
                    row["country"] = ((h_obj.get("country") or {}) or {}).get("name")
                    row["logo_url"] = h_obj.get("logo") or h_obj.get("crest")
                elif sid == a_sid:
                    row["name"] = a_obj.get("name") or a_obj.get("teamName") or "Away Team"
                    row["short_name"] = a_obj.get("shortName")
                    row["country"] = ((a_obj.get("country") or {}) or {}).get("name")
                    row["logo_url"] = a_obj.get("logo") or a_obj.get("crest")
                else:
                    row.setdefault("name", f"Team {sid}")
            if seen:
                # Prefer exactly two teams: home and away when known
                if h_sid and a_sid and h_sid in seen and a_sid in seen:
                    teams = [seen[h_sid], seen[a_sid]]
                else:
                    # fallback: take first two distinct teams
                    teams = list(seen.values())[:2]

        # Ako je i dalje prazno, sintetiziraj minimalno iz enriched home/away id + name
        if not teams:
            if minimal_teams:
                teams = minimal_teams.copy()
        else:
            # Merge any missing minimal teams into existing list (avoid duplicates)
            existing_ids = {t.get("sofascore_id") for t in teams if t.get("sofascore_id")}
            for mt in minimal_teams:
                if mt.get("sofascore_id") and mt["sofascore_id"] not in existing_ids:
                    teams.append(mt)

    # match
    def _safe_ts(ts):
        if ts is None:
            return None
        try:
            # Some APIs return milliseconds; normalise to seconds if too large
            tsv = int(ts)
            if tsv > 10**12:
                tsv = tsv // 1000
            return datetime.fromtimestamp(tsv, tz=timezone.utc).isoformat()
        except Exception:
            return None

    # Ako matches nije došao iz procesora ili je prazan, sintetiziraj ga
    if not matches:
        hs = enriched.get("homeScore") or {}
        as_ = enriched.get("awayScore") or {}
        comp_h, comp_a = _compute_score_from_events(enriched)
        st = _infer_status(enriched)
        mrow = {
            "source": "sofascore",
            "source_event_id": EVENT_ID,
            "home_team": ((enriched.get("homeTeam") or {}).get("name")),
            "away_team": ((enriched.get("awayTeam") or {}).get("name")),
            "home_score": _to_int(hs.get("current")) if hs.get("current") is not None else comp_h,
            "away_score": _to_int(as_.get("current")) if as_.get("current") is not None else comp_a,
            "status": st,
            "competition": (enriched.get("tournament") or {}).get("name"),
            "season": (enriched.get("season") or {}).get("name") or (enriched.get("season") or {}).get("year") or (enriched.get("_season_str")),
            "round": (_extract_round_label(enriched) or (enriched.get("roundInfo") or {}).get("round") or enriched.get("round")),
            "venue": (enriched.get("venue") or {}).get("name"),
            "home_team_sofascore_id": _to_int((enriched.get("homeTeam") or {}).get("id") or enriched.get("home_team_sofa")),
            "away_team_sofascore_id": _to_int((enriched.get("awayTeam") or {}).get("id") or enriched.get("away_team_sofa")),
            "competition_sofascore_id": _to_int((enriched.get("tournament") or {}).get("id")),
            "start_time": _find_start_ts(enriched) or datetime.now(timezone.utc).isoformat(),
        }
        rlabel = _extract_round_label(enriched)
        if rlabel:
            mrow["round"] = rlabel
        # If names missing, try to derive from slug
        if not (mrow["home_team"] and mrow["away_team"]):
            slug = (enriched.get("slug") or (enriched.get("event") or {}).get("slug"))
            if isinstance(slug, str) and "-" in slug:
                try:
                    parts = slug.split("-")
                    mid = len(parts)//2
                    home_name = " ".join(parts[:mid]).strip().title()
                    away_name = " ".join(parts[mid:]).strip().title()
                    if home_name and not mrow["home_team"]:
                        mrow["home_team"] = home_name
                    if away_name and not mrow["away_team"]:
                        mrow["away_team"] = away_name
                except Exception:
                    pass
        if mrow["home_team"] and mrow["away_team"]:
            if not mrow.get("status"):
                mrow["status"] = _infer_status(enriched)
            matches = [mrow]
        else:
            logger.info("[fallback] preskačem match upsert (nema home/away imena)")
    else:
        # Uvijek dodaj jedan sintetizirani red (upsert po source,source_event_id će ga spojiti)
        hs = enriched.get("homeScore") or {}
        as_ = enriched.get("awayScore") or {}
        st = _infer_status(enriched)
        mrow2 = {
            "source": "sofascore",
            "source_event_id": EVENT_ID,
            "home_team": ((enriched.get("homeTeam") or {}).get("name")),
            "away_team": ((enriched.get("awayTeam") or {}).get("name")),
            "home_score": _to_int(hs.get("current")) or _compute_score_from_events(enriched)[0],
            "away_score": _to_int(as_.get("current")) or _compute_score_from_events(enriched)[1],
            "status": st or "upcoming",
            "competition": (enriched.get("tournament") or {}).get("name"),
            "season": (enriched.get("season") or {}).get("name") or (enriched.get("season") or {}).get("year") or (enriched.get("_season_str")),
            "round": (_extract_round_label(enriched) or (enriched.get("roundInfo") or {}).get("round") or enriched.get("round")),
            "venue": (enriched.get("venue") or {}).get("name"),
            "home_team_sofascore_id": _to_int((enriched.get("homeTeam") or {}).get("id") or enriched.get("home_team_sofa")),
            "away_team_sofascore_id": _to_int((enriched.get("awayTeam") or {}).get("id") or enriched.get("away_team_sofa")),
            "competition_sofascore_id": _to_int((enriched.get("tournament") or {}).get("id")),
            "start_time": _find_start_ts(enriched) or datetime.now(timezone.utc).isoformat(),
        }
        rlabel2 = _extract_round_label(enriched)
        if rlabel2:
            mrow2["round"] = rlabel2
        if mrow2["home_team"] and mrow2["away_team"]:
            matches.append(mrow2)

    logger.info(
        "[parsed] comps=%s teams=%s players=%s matches=%s lineups=%s formations=%s events=%s pstats=%s mstats=%s shots=%s avgpos=%s",
        len(comps), len(teams), len(players), len(matches),
        len(lineups_temp), len(formations_temp), len(events_temp), len(pstats_temp), len(mstats_temp),
        len(shots_temp), len(avgpos_temp)
    )
    try:
        logger.info(f"[debug] teams payload sample={teams[:2] if isinstance(teams, list) else teams}")
        logger.info(f"[debug] matches sample={matches[:1] if isinstance(matches, list) else matches}")
    except Exception:
        pass

    # upserts – competitions & teams & players & matches
    ok, fail = db.upsert_competitions(comps); logger.info(f"✅ competitions: ok={ok} fail={fail}")
    ok, fail = db.upsert_teams(teams);       logger.info(f"✅ teams:         ok={ok} fail={fail}")
    # ensure players exist so that lineups can resolve player_id
    try:
        if players:
            pok, pfail = db.upsert_players(players)
            logger.info(f"✅ players:       ok={pok} fail={pfail}")
        else:
            logger.info("ℹ️ players:       nothing to upsert")
    except Exception as ex:
        logger.info(f"ℹ️ players upsert skipped: {ex}")

    # ensure we can map teams even if teams list was sparse
    team_sofas = [t.get("sofascore_id") for t in teams if t.get("sofascore_id")]
    # also include sofascore ids referenced on the match row(s)
    for m in matches:
        for key in ("home_team_sofascore_id", "away_team_sofascore_id"):
            if m.get(key):
                team_sofas.append(m.get(key))
    # include formations-derived team IDs as mapping hints
    for f in (formations_temp or []):
        if f.get("team_sofascore_id"):
            team_sofas.append(f.get("team_sofascore_id"))
    # Ako još uvijek prazno, dodaj direktno iz enriched
    if not team_sofas:
        for sid in [
            _to_int((enriched.get("homeTeam") or {}).get("id") or enriched.get("home_team_sofa")),
            _to_int((enriched.get("awayTeam") or {}).get("id") or enriched.get("away_team_sofa")),
        ]:
            if sid:
                team_sofas.append(sid)
        # fallback: from raw lineups players teamId
        if not team_sofas and isinstance(enriched.get("_raw_lineups"), dict):
            rl = enriched.get("_raw_lineups") or {}
            for side in ("home", "away"):
                sobj = rl.get(side) or {}
                for p in (sobj.get("players") or []):
                    sid = _to_int(p.get("teamId") or (p.get("team") or {}).get("id"))
                    if sid:
                        team_sofas.append(sid)
        # Ako smo sintetizirali ID-jeve, pobrini se da bar minimalni timovi postoje u DB-u
        if team_sofas and not teams:
            minimal = []
            if team_sofas[0]:
                minimal.append({
                    "sofascore_id": team_sofas[0],
                    "name": ((enriched.get("homeTeam") or {}).get("name")) or "Home Team",
                })
            if len(team_sofas) > 1 and team_sofas[1]:
                minimal.append({
                    "sofascore_id": team_sofas[1],
                    "name": ((enriched.get("awayTeam") or {}).get("name")) or "Away Team",
                })
            if minimal:
                try:
                    db.upsert_teams(minimal)
                except Exception:
                    pass
    logger.debug(f"[debug] team_sofas candidates={team_sofas}")
    team_map = db.get_team_ids_by_sofa(team_sofas)

    comp_sofas = [c.get("sofascore_id") for c in comps if c.get("sofascore_id")]
    comp_map = db.map_competitions_by_sofa(comp_sofas)

    # match foreign keys enrich + ensure required fields present
    for m in matches:
        # Fill missing team names from enriched event
        if not m.get("home_team"):
            m["home_team"] = ((enriched.get("homeTeam") or {}).get("name")) or None
        if not m.get("away_team"):
            m["away_team"] = ((enriched.get("awayTeam") or {}).get("name")) or None
        # Fill missing status/start_time
        if (m.get("status") in (None, "upcoming", "unknown")):
            m["status"] = _infer_status(enriched)
        if not m.get("start_time"):
            st_iso = _find_start_ts(enriched)
            if st_iso:
                m["start_time"] = st_iso

        h_sofa = m.get("home_team_sofascore_id") or enriched.get("home_team_sofa")
        a_sofa = m.get("away_team_sofascore_id") or enriched.get("away_team_sofa")
        if h_sofa in team_map and not m.get("home_team_id"):
            m["home_team_id"] = team_map[h_sofa]
        if a_sofa in team_map and not m.get("away_team_id"):
            m["away_team_id"] = team_map[a_sofa]

        comp_sofa = m.get("competition_sofascore_id") or next((c.get("sofascore_id") for c in comps if c.get("sofascore_id")), None)
        if comp_sofa in comp_map and not m.get("competition_id"):
            m["competition_id"] = comp_map[comp_sofa]

        if isinstance(m.get("season"), dict):
            m["season"] = m["season"].get("name") or m["season"].get("year")

        # Ensure non-empty team names; DB requires home_team/away_team NOT NULL
        if not (isinstance(m.get("home_team"), str) and m.get("home_team").strip()):
            hsid = m.get("home_team_sofascore_id") or enriched.get("home_team_sofa")
            if hsid:
                m["home_team"] = f"Team {hsid}"
        if not (isinstance(m.get("away_team"), str) and m.get("away_team").strip()):
            asid = m.get("away_team_sofascore_id") or enriched.get("away_team_sofa")
            if asid:
                m["away_team"] = f"Team {asid}"

    ok, fail = db.batch_upsert_matches(matches); logger.info(f"✅ matches:       ok={ok} fail={fail}")

    pairs: List[Tuple[str, int]] = []
    for m in matches:
        if m.get("source") and m.get("source_event_id") is not None:
            pairs.append((m["source"], int(m["source_event_id"])))
    match_map = db.get_match_ids_by_source_ids(pairs)

    # Post-upsert: ensure final score and finished status are set if we could infer them
    try:
        ch, ca = _compute_score_from_events(enriched)
        st_final = _infer_status(enriched)
        # If match exists, do a light patch; if not, include required fields to satisfy NOT NULLs
        exists = False
        try:
            exists = ("sofascore", int(EVENT_ID)) in match_map
        except Exception:
            exists = False

        if exists:
            patch: Dict[str, Any] = {"source": "sofascore", "source_event_id": EVENT_ID}
            # Prefer computed score from events; fallback to current score fields
            hs = enriched.get("homeScore") or {}
            as_ = enriched.get("awayScore") or {}
            if ch is None:
                ch = _to_int(hs.get("current"))
            if ca is None:
                ca = _to_int(as_.get("current"))
            if ch is not None:
                patch["home_score"] = ch
            if ca is not None:
                patch["away_score"] = ca
            if st_final:
                patch["status"] = st_final
            # also ensure season/round are simple strings if available
            sea = (enriched.get("season") or {}).get("name") or (enriched.get("season") or {}).get("year") or (enriched.get("_season_str"))
            if sea:
                patch["season"] = sea
            # prefer friendly label if we have it
            rnd_label = _extract_round_label(enriched) or enriched.get("_round_label")
            if rnd_label:
                patch["round"] = rnd_label
            else:
                # round: prefer a human-friendly label when possible
                rlbl = _extract_round_label(enriched)
                rnd = rlbl or enriched.get("round") or ((enriched.get("roundInfo") or {}).get("round") if isinstance(enriched.get("roundInfo"), dict) else None)
                if rnd:
                    patch["round"] = rnd
            # if we discovered a start time, patch it as well
            st_iso2 = _find_start_ts(enriched)
            if st_iso2:
                patch["start_time"] = st_iso2
            # include venue if known
            v = (enriched.get("venue") or {}).get("name")
            if v:
                patch["venue"] = v
            if len(patch) > 2:
                try:
                    # Use targeted update to avoid accidental inserts
                    db._patch_match(patch)
                except Exception:
                    # fallback to upsert
                    db._upsert("matches", [patch], on_conflict="source,source_event_id")
        else:
            # Build a full row ensuring NOT NULL columns are present
            hs = enriched.get("homeScore") or {}
            as_ = enriched.get("awayScore") or {}
            st_iso = _find_start_ts(enriched) or datetime.now(timezone.utc).isoformat()
            full: Dict[str, Any] = {
                "source": "sofascore",
                "source_event_id": EVENT_ID,
                "home_team": ((enriched.get("homeTeam") or {}).get("name")) or "Home Team",
                "away_team": ((enriched.get("awayTeam") or {}).get("name")) or "Away Team",
                "home_score": (_to_int(hs.get("current")) if hs.get("current") is not None else ch),
                "away_score": (_to_int(as_.get("current")) if as_.get("current") is not None else ca),
                "status": st_final or _pack_status(enriched) or "upcoming",
                "start_time": st_iso,
                "competition": (enriched.get("tournament") or {}).get("name"),
                "season": (enriched.get("season") or {}).get("name") or (enriched.get("season") or {}).get("year") or (enriched.get("_season_str")),
                "venue": (enriched.get("venue") or {}).get("name"),
                "home_team_sofascore_id": _to_int((enriched.get("homeTeam") or {}).get("id") or enriched.get("home_team_sofa")),
                "away_team_sofascore_id": _to_int((enriched.get("awayTeam") or {}).get("id") or enriched.get("away_team_sofa")),
                "competition_sofascore_id": _to_int((enriched.get("tournament") or {}).get("id")),
            }
            # include round label or number if known
            if enriched.get("_round_label"):
                full["round"] = enriched.get("_round_label")
            elif enriched.get("round") is not None:
                full["round"] = enriched.get("round")
            try:
                db._upsert("matches", [full], on_conflict="source,source_event_id")
            except Exception:
                pass
    except Exception:
        pass

    # Fallback: if match isn't mapped (0 newly created or existed but not found),
    # force-insert a minimal row so downstream relations can attach.
    if not match_map and pairs:
        try:
            # Build a minimal match row from enriched payload
            hs = enriched.get("homeScore") or {}
            as_ = enriched.get("awayScore") or {}
            st_val = _find_start_ts(enriched) or _safe_ts(enriched.get("startTimestamp")) or datetime.now(timezone.utc).isoformat()
            ch, ca = _compute_score_from_events(enriched)
            st_final = _infer_status(enriched)
            fallback_match = {
                "source": "sofascore",
                "source_event_id": EVENT_ID,
                "home_team": ((enriched.get("homeTeam") or {}).get("name")) or "Home",
                "away_team": ((enriched.get("awayTeam") or {}).get("name")) or "Away",
                "home_score": (_to_int(hs.get("current")) if hs.get("current") is not None else ch),
                "away_score": (_to_int(as_.get("current")) if as_.get("current") is not None else ca),
                "status": st_final or _pack_status(enriched) or "upcoming",
                "start_time": st_val,
            }
            # Ensure names exist; if missing, skip forcing
            if fallback_match["home_team"] and fallback_match["away_team"]:
                db._upsert("matches", [fallback_match], on_conflict="source,source_event_id")
                match_map = db.get_match_ids_by_source_ids(pairs)
                logger.info(f"[fallback] forced minimal match insert -> mapped={len(match_map)}")
        except Exception as ex:
            logger.info(f"[fallback] minimal match insert failed: {ex}")

    # players map (+ iz shotova/avgpos)
    player_sofas = [x.get("player_sofascore_id") for x in lineups_temp] + [x.get("player_sofascore_id") for x in pstats_temp]
    player_sofas += [x.get("player_sofascore_id") for x in shots_temp if x.get("player_sofascore_id")]
    player_sofas += [x.get("assist_player_sofascore_id") for x in shots_temp if x.get("assist_player_sofascore_id")]
    player_sofas += [x.get("player_sofascore_id") for x in avgpos_temp if x.get("player_sofascore_id")]
    player_sofas = [p for p in player_sofas if p]
    player_map = db.get_player_ids_by_sofa(player_sofas)

    # backfill players.team_id (ako treba)
    backfill = []
    for lu in lineups_temp:
        pid = lu.get("player_sofascore_id")
        tid_sofa = lu.get("team_sofascore_id")
        if pid in player_map and tid_sofa in team_map:
            backfill.append({"sofascore_id": int(pid), "team_id": team_map[tid_sofa]})
    if backfill:
        db.backfill_players_team_id(backfill)

    def _mid(obj):
        obj.setdefault("source", "sofascore")
        if obj.get("source_event_id") is None:
            obj["source_event_id"] = EVENT_ID
        s = obj.get("source"); sid = obj.get("source_event_id")
        return match_map.get((s, int(sid))) if s and sid is not None else None

    # --- managers (coaches) ---
    coaches = enriched.get("coaches") or {}
    # Build basic manager rows for upsert
    mgr_rows = []
    for side in ("home", "away"):
        ent = coaches.get(side)
        if isinstance(ent, dict):
            mid = ent.get("id") or ent.get("sofascore_id")
            name = ent.get("name") or ent.get("full_name")
            if mid and name:
                mgr_rows.append({
                    "sofascore_id": int(mid),
                    "full_name": name,
                })
    if mgr_rows:
        mok, mfail = db.upsert_managers(mgr_rows)
        logger.info(f"✅ managers:      ok={mok} fail={mfail}")
    db.upsert_match_managers(coaches, match_map, team_map)

    # --- lineups ---
    lineups = []
    for r in lineups_temp:
        mid = _mid(r)
        pid = player_map.get(r.get("player_sofascore_id"))
        tid = team_map.get(r.get("team_sofascore_id"))
        if not (mid and pid): continue
        lineups.append({
            "match_id": mid, "team_id": tid, "player_id": pid,
            "position": r.get("position"), "jersey_number": r.get("jersey_number"),
            "is_starting": bool(r.get("is_starting")), "is_captain": bool(r.get("is_captain")),
        })
    ok, fail = db.upsert_lineups(lineups); logger.info(f"✅ lineups:       ok={ok} fail={fail}")

    # --- formations ---
    formations = []
    for f in formations_temp:
        mid = _mid(f); tid = team_map.get(f.get("team_sofascore_id"))
        if not (mid and tid and f.get("formation")): continue
        formations.append({"match_id": mid, "team_id": tid, "formation": f.get("formation")})
    ok, fail = db.upsert_formations(formations); logger.info(f"✅ formations:    ok={ok} fail={fail}")

    # --- events ---
    events = []
    for e in events_temp:
        mid = _mid(e)
        if not mid: continue
        team = e.get("team") or e.get("side")
        if team not in ("home", "away"): continue
        raw_type = e.get("event_type") or e.get("type") or e.get("incidentType")
        etype = _norm_event_type(raw_type, e.get("color") or e.get("card_color"))
        if not etype:
            continue
        events.append({
            "match_id": mid,
            "minute": _as_min(e.get("minute")),
            "event_type": etype,
            "player_name": e.get("player_name") or (e.get("player") or {}).get("name"),
            "team": team,
            "description": e.get("description"),
        })
    ok, fail = db.upsert_match_events(events); logger.info(f"✅ match_events:  ok={ok} fail={fail}")

    # --- player stats ---
    pstats = []
    for s in pstats_temp:
        mid = _mid(s)
        pid = player_map.get(s.get("player_sofascore_id"))
        tid = team_map.get(s.get("team_sofascore_id"))
        if not (mid and pid): continue
        pstats.append({
            "match_id": mid, "player_id": pid, "team_id": tid,
            "goals": s.get("goals"), "assists": s.get("assists"), "shots": s.get("shots"),
            "passes": s.get("passes"), "tackles": s.get("tackles"), "rating": s.get("rating"),
            "minutes_played": s.get("minutes_played"),
            "is_substitute": bool(s.get("is_substitute")),
            "was_subbed_in": bool(s.get("was_subbed_in")), "was_subbed_out": bool(s.get("was_subbed_out")),
        })
    ok, fail = db.upsert_player_stats(pstats); logger.info(f"✅ player_stats:  ok={ok} fail={fail}")

    # --- match (team) stats ---
    mstats = []
    for s in mstats_temp:
        mid = _mid(s)
        tid = team_map.get(s.get("sofascore_team_id") or s.get("team_sofascore_id"))
        if not (mid and tid): continue
        mstats.append({
            "match_id": mid, "team_id": tid,
            "possession": s.get("possession"), "shots_total": s.get("shots_total"),
            "shots_on_target": s.get("shots_on_target"), "corners": s.get("corners"),
            "fouls": s.get("fouls"), "offsides": s.get("offsides"),
            "yellow_cards": s.get("yellow_cards"), "red_cards": s.get("red_cards"),
            "passes": s.get("passes"), "pass_accuracy": s.get("pass_accuracy"),
            "xg": s.get("xg"), "saves": s.get("saves"),
            "updated_at": s.get("updated_at") or datetime.now(timezone.utc).isoformat(),
        })
    ok, fail = db.upsert_match_stats(mstats); logger.info(f"✅ match_stats:   ok={ok} fail={fail}")

    # --- SHOTS ---
    shots_payload = []
    dropped_no_player = dropped_no_minute = dropped_bad_outcome = dropped_no_xy = 0
    for r in shots_temp:
        mid = _mid(r)
        if not mid:
            continue
        pid = player_map.get(r.get("player_sofascore_id"))
        aid = player_map.get(r.get("assist_player_sofascore_id")) if r.get("assist_player_sofascore_id") else None
        if not pid:
            dropped_no_player += 1
            continue
        if r.get("minute") is None:
            dropped_no_minute += 1
            continue
        if r.get("outcome") not in ALLOWED_OUTCOMES:
            dropped_bad_outcome += 1
            continue
        if r.get("x") is None or r.get("y") is None:
            dropped_no_xy += 1
            continue
        shots_payload.append({
            "match_id": mid,
            "player_id": pid,
            "assist_player_id": aid,
            "minute": r.get("minute"),
            "second": r.get("second"),
            "x": r.get("x"),
            "y": r.get("y"),
            "body_part": r.get("body_part"),
            "situation": r.get("situation"),
            "outcome": r.get("outcome"),
            "is_penalty": r.get("is_penalty"),
            "is_own_goal": r.get("is_own_goal"),
            "xg": r.get("xg"),
            "source": r.get("source"),
            "source_event_id": r.get("source_event_id"),
            "source_item_id": r.get("source_item_id"),
        })

    if shots_payload:
        ok, fail = db.upsert_shots(shots_payload)
        logger.info(f"✅ shots: ok={ok} fail={fail}")
        # Ako nešto padne, spremi raw u log za kasniji backfill
        if fail > 0:
            try:
                eid = _event_id(enriched)
                from pathlib import Path
                import json
                Path("logs").mkdir(parents=True, exist_ok=True)
                with open(Path("logs")/f"shots_failed_{eid}.json", "w", encoding="utf-8") as f:
                    json.dump(shots_payload, f, ensure_ascii=False, indent=2)
            except Exception:
                pass


    # --- AVERAGE POSITIONS ---
    if avgpos_temp:
        avgpos_payload = []
        dropped_ap_no_player = dropped_ap_no_xy = 0
        for r in avgpos_temp:
            mid = _mid(r)
            if not mid: continue
            pid = player_map.get(r.get("player_sofascore_id"))
            if not pid:
                dropped_ap_no_player += 1
                continue
            if r.get("avg_x") is None or r.get("avg_y") is None:
                dropped_ap_no_xy += 1
                continue
            avgpos_payload.append({
                "match_id": mid,
                "player_id": pid,
                "avg_x": r.get("avg_x"),
                "avg_y": r.get("avg_y"),
                "touches": r.get("touches"),
                "minutes_played": r.get("minutes_played"),
            })
        if avgpos_payload:
            ok, fail = db.upsert_average_positions(avgpos_payload)
            logger.info(f"✅ average_positions: ok={ok} fail={fail} (dropped: no_player={dropped_ap_no_player}, no_xy={dropped_ap_no_xy})")
        else:
            logger.info("ℹ️ average_positions: nema valjanih redova")
    else:
        logger.info("ℹ️ average_positions: raw nije dostupan")

    # --- STANDINGS (opcionalno, ako znamo comp + sezonu) ---
    try:
        comp_sofa = enriched.get("_comp_sofa")
        season_id = enriched.get("_season_id")
        season_str = enriched.get("_season_str") or (matches[0].get("season") if matches else None)
        if comp_sofa and season_str:
            b = Browser()
            try:
                raw_std = _fetch_standings(b, int(comp_sofa), _to_int(season_id)) or {}
            finally:
                try: b.close()
                except Exception: pass

            if raw_std:
                sp = StandingsProcessor()
                wire = sp.parse(raw_std, int(comp_sofa), str(season_str))
                prepared = []
                for row in wire:
                    # mapiranja UUID-a
                    # ove će map-e biti prazne ako teams nismo upisali – zato gore radimo fallback
                    # pa bi sada trebale postojati
                    tid = team_map.get(row["team_sofascore_id"])
                    cid = comp_map.get(row["competition_sofascore_id"])
                    if not (tid and cid): 
                        continue
                    prepared.append({
                        "competition_id": cid,
                        "season": row["season"],
                        "team_id": tid,
                        "rank": row["rank"],
                        "played": row["played"],
                        "wins": row["wins"],
                        "draws": row["draws"],
                        "losses": row["losses"],
                        "goals_for": row["goals_for"],
                        "goals_against": row["goals_against"],
                        "points": row["points"],
                        "form": row["form"],
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    })
                if prepared:
                    ok, fail = db.upsert_standings(prepared)
                    logger.info(f"✅ standings: ok={ok} fail={fail}")
                else:
                    logger.info("ℹ️ standings: ništa za upsert (mapiranja?)")
            else:
                logger.info("ℹ️ standings: endpoint nije dao podatke")
    except Exception as ex:
        logger.info(f"ℹ️ standings skipped: {ex}")

    logger.info("✅ Done.")

if __name__ == "__main__":
    main()