from __future__ import annotations

# debug_one_event.py — single-event debug & upsert runner (shots + avg positions)

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

# ===================== CLI =====================
parser = argparse.ArgumentParser(description="Debug upsert za jedan SofaScore event")
parser.add_argument("--event", type=int, default=14060714, help="SofaScore event ID")
args = parser.parse_args()
EVENT_ID = args.event

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
        return "penalty_goal"  # ako timeline kaže samo 'penalty', tretiraj kao golski događaj
    return None

def _side_key(v):
    return "home" if v in ("home", 1, "1", True) else ("away" if v in ("away", 2, "2", False) else None)

def _to_int(x):
    try:
        if isinstance(x, str):
            x = x.strip().replace("%", "").replace(",", ".")
        return int(float(x))
    except Exception:
        return None

def _to_float(x):
    try:
        if isinstance(x, str):
            x = x.strip().replace("%", "").replace(",", ".")
        return float(x)
    except Exception:
        return None

# ===================== STAT PARSING =====================
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
    "xa": ("xa", "float"),
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

def _parse_pass_accuracy(s):
    if not isinstance(s, str):
        return _to_int(s)
    s = s.strip()
    if "(" in s and ")" in s and "%" in s:
        pct = s[s.find("(")+1:s.find(")")].replace("%", "")
        return _to_int(pct)
    if s.endswith("%"):
        return _to_int(s)
    return None

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

def _build_player_stats_from_raw(ev: Dict[str, Any]) -> List[Dict[str, Any]]:
    raw = ev.get("_raw_player_stats") or {}
    out: List[Dict[str, Any]] = []

    def _side_players(side_obj):
        if isinstance(side_obj, dict):
            return side_obj.get("players") or side_obj.get("statistics") or side_obj.get("items") or []
        if isinstance(side_obj, list):
            return side_obj
        return []

    h_tid = ev.get("home_team_sofa") or ((ev.get("homeTeam") or {}).get("id"))
    a_tid = ev.get("away_team_sofa") or ((ev.get("awayTeam") or {}).get("id"))
    homes = _side_players(raw.get("home"))
    aways = _side_players(raw.get("away"))

    def _collect(pside, tid):
        for p in pside:
            pobj = p.get("player") or p
            stats = p.get("statistics") or p.get("stats") or {}
            pid = pobj.get("id")
            if not pid:
                continue
            out.append({
                "player_sofascore_id": int(pid),
                "team_sofascore_id": int(tid) if tid else None,
                "goals": _to_int(stats.get("goals")),
                "assists": _to_int(stats.get("assists")),
                "shots": _to_int(stats.get("totalShots") or stats.get("shotsTotal") or stats.get("shots")),
                "passes": _to_int(stats.get("totalPasses") or stats.get("passes")),
                "tackles": _to_int(stats.get("tackles") or stats.get("totalTackles")),
                "rating": _to_float(p.get("rating") or stats.get("rating")),
                "minutes_played": _to_int(stats.get("minutesPlayed") or stats.get("timePlayed") or stats.get("minutes")),
                "is_substitute": bool(p.get("isSubstitute") or p.get("substitute")),
                "was_subbed_in": bool(stats.get("subbedIn") or stats.get("wasSubbedIn")),
                "was_subbed_out": bool(stats.get("subbedOut") or stats.get("wasSubbedOut")),
                "source": "sofascore", "source_event_id": _event_id(ev),
            })
    if homes or aways:
        _collect(homes, h_tid)
        _collect(aways, a_tid)
        logger.info(f"[fallback] player_stats built from raw player-statistics: {len(out)}")
        return out

    logger.info("[fallback] player_stats: nema 'player-statistics' raw podataka")
    return []

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
            pobj = p.get("player") or {}
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
    # pokušaj više mogućih ruta
    candidates = [
        f"event/{eid}/shotmap",
        f"event/{eid}/shots",
        f"event/{eid}/attacks/shotmap",
    ]
    for path in candidates:
        data = _safe_fetch(b, path)
        if data:
            return data
    return None

# >>> FIX: robust parser for SofaScore shotmap structure <<<
def _build_shots_from_raw(ev: Dict[str, Any]) -> List[Dict[str, Any]]:
    raw = ev.get("_raw_shots")
    if not raw:
        return []

    # "shotmap" (Sofa) or legacy "shots" or plain list
    shots = None
    if isinstance(raw, dict):
        for key in ("shotmap", "shots", "items"):
            val = raw.get(key)
            if isinstance(val, list):
                shots = val
                break
    elif isinstance(raw, list):
        shots = raw

    if not isinstance(shots, list) or not shots:
        return []

    # team mapiranje
    h_tid = ev.get("home_team_sofa") or ((ev.get("homeTeam") or {}).get("id"))
    a_tid = ev.get("away_team_sofa") or ((ev.get("awayTeam") or {}).get("id"))

    def _coords(s: Dict[str, Any]) -> Tuple[Optional[float], Optional[float]]:
        pc = s.get("playerCoordinates") or {}
        if isinstance(pc, dict) and (pc.get("x") is not None and pc.get("y") is not None):
            return _to_float(pc.get("x")), _to_float(pc.get("y"))
        draw = s.get("draw") or {}
        start = draw.get("start") or {}
        if isinstance(start, dict) and (start.get("x") is not None and start.get("y") is not None):
            # Sofa "draw.start" koristi (x,y) u postotcima terena
            return _to_float(start.get("y")), _to_float(start.get("x"))  # napomena: nekad zamijene osi
        # fallback: top-level x/y ako postoje
        return _to_float(s.get("x")), _to_float(s.get("y"))

    outcome_map = {
        "goal": ("goal", True, True),
        "save": ("saved", False, True),
        "blocked": ("blocked", False, False),
        "block": ("blocked", False, False),
        "miss": ("off_target", False, False),
        "post": ("post", False, False),
        "bar": ("post", False, False),
    }

    out: List[Dict[str, Any]] = []
    for s in shots:
        player_obj = s.get("player") or s.get("shooter") or {}
        pid = player_obj.get("id") or s.get("playerId")

        side = _side_key(s.get("isHome") or s.get("team") or s.get("side"))
        team_sofa = (h_tid if side == "home" else a_tid) or s.get("teamId")

        shot_type = (s.get("shotType") or s.get("type") or "").strip().lower()
        outcome, is_goal, on_target = outcome_map.get(shot_type, (None, False, False))
        # Extra signal
        is_goal = bool(is_goal or s.get("goal") or s.get("goalType") == "regular")
        if is_goal:
            outcome = "goal"; on_target = True

        # minute
        minute = _as_min(s.get("time"))
        # Ako želiš uključiti nadoknadu, ostavi u komentar:  minute = _to_int(s.get("time") or 0) + (_to_int(s.get("addedTime") or 0) or 0)

        x, y = _coords(s)

        out.append({
            "player_sofascore_id": int(pid) if pid else None,
            "assist_player_sofascore_id": None,  # Sofa shotmap najčešće ne daje assist ID
            "team_sofascore_id": int(team_sofa) if team_sofa else None,
            "minute": minute,
            "x": x,
            "y": y,
            "xg": _to_float(s.get("xg") or s.get("expectedGoals") or s.get("xgValue")),
            "on_target": bool(on_target),
            "is_goal": bool(is_goal),
            "is_penalty": ("pen" in str(s.get("situation") or "").lower()) or bool(s.get("isPenalty")),
            "is_own_goal": bool(s.get("isOwnGoal") or ("own" in str(s.get("goalType") or "").lower())),
            "outcome": outcome or ("saved" if on_target else "off_target"),
            "source": "sofascore",
            "source_event_id": _event_id(ev),
        })

    # očisti redove bez ključnih polja
    out = [r for r in out if r.get("player_sofascore_id") and r.get("minute") is not None]
    logger.info(f"[shots] parsed {len(out)} items from shotmap")
    return out

# ===================== AVERAGE POSITIONS =====================
def _fetch_avg_positions(b: Browser, eid: int) -> Any:
    candidates = [
        f"event/{eid}/average-positions",
        f"event/{eid}/averagepositions",
        f"event/{eid}/positions/average",
    ]
    for path in candidates:
        data = _safe_fetch(b, path)
        if data:
            return data
    return None

# >>> FIX: parse touches/minutes and map to DB columns later <<<
def _build_avg_positions_from_raw(ev: Dict[str, Any]) -> List[Dict[str, Any]]:
    raw = ev.get("_raw_avg_positions")
    if not raw:
        return []

    h_tid = ev.get("home_team_sofa") or ((ev.get("homeTeam") or {}).get("id"))
    a_tid = ev.get("away_team_sofa") or ((ev.get("awayTeam") or {}).get("id"))

    def _iter_side_items_from_dict(d: Dict[str, Any]):
        # 1) explicitno home/away ključevi
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
        # 2) teams: [ {side:'home', players:[...]}, ... ]
        teams = d.get("teams")
        if isinstance(teams, list):
            for t in teams:
                side = _side_key(t.get("isHome")) or (t.get("side") if t.get("side") in ("home","away") else None)
                lst = (t.get("players") or t.get("items") or [])
                if side and isinstance(lst, list):
                    for it in lst:
                        yield side, it
        # 3) top-level players/items
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
        # ako side nije poznat iz strukture, odredi iz polja unutar itema
        side = side or _side_key(it.get("isHome")) or (it.get("team") if it.get("team") in ("home","away") else None)
        if side not in ("home","away"):
            continue

        pobj = it.get("player") or it
        pid = pobj.get("id") or it.get("playerId")
        if not pid:
            continue

        x = _to_float(it.get("x") or it.get("avgX") or it.get("averageX") or (it.get("position") or {}).get("x"))
        y = _to_float(it.get("y") or it.get("avgY") or it.get("averageY") or (it.get("position") or {}).get("y"))

        stats_obj = it.get("statistics") or {}
        touches = _to_int(it.get("touches") or it.get("events") or it.get("eventsCount") or stats_obj.get("touches"))
        minutes = _to_int(it.get("minutesPlayed") or it.get("timePlayed") or stats_obj.get("minutesPlayed"))

        out.append({
            "player_sofascore_id": int(pid),
            "team_sofascore_id": int(h_tid if side == "home" else a_tid) if (h_tid or a_tid) else None,
            "x": x, "y": y,
            "touches": touches,
            "minutes_played": minutes,
            "period": (raw.get("period") if isinstance(raw, dict) else None) or it.get("period") or "ALL",
            "source": "sofascore",
            "source_event_id": _event_id(ev),
        })

    logger.info(f"[avg_positions] parsed {len(out)} items")
    return out


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
        logger.warning(f"[fetch] {path} failed: {ex}")
        return None

def _fetch_all_today() -> List[Dict[str, Any]]:
    today = datetime.now(timezone.utc).date().isoformat()
    b = Browser()
    try:
        live_json  = _safe_fetch(b, "events/live") or {}
        sched_json = _safe_fetch(b, f"scheduled-events/{today}") or {}
        live  = (live_json.get("events") if isinstance(live_json, dict) else live_json) or []
        sched = (sched_json.get("events") if isinstance(sched_json, dict) else sched_json) or []
        return list(live) + list(sched)
    finally:
        try: b.close()
        except Exception: pass

def _parse_event_managers_payload(data: Any) -> Dict[str, Optional[Dict[str, Any]]]:
    out = {"home": None, "away": None}
    if not data:
        return out
    if isinstance(data, dict) and ("home" in data or "away" in data):
        for side in ("home", "away"):
            obj = data.get(side) or {}
            if isinstance(obj, dict):
                m = obj.get("manager") or obj
                if m.get("id") or m.get("name"):
                    out[side] = {"id": m.get("id"), "name": m.get("name")}
        return out
    if isinstance(data, dict) and ("homeManager" in data or "awayManager" in data):
        for side, key in (("home", "homeManager"), ("away", "awayManager")):
            m = data.get(key) or {}
            if m.get("id") or m.get("name"):
                out[side] = {"id": m.get("id"), "name": m.get("name")}
        return out
    lst = None
    if isinstance(data, dict) and "managers" in data:
        lst = data.get("managers")
    elif isinstance(data, list):
        lst = data
    if isinstance(lst, list):
        for m in lst:
            side = _side_key(m.get("isHome")) or (m.get("side") if m.get("side") in ("home","away") else None)
            if side and (m.get("id") or m.get("name")):
                out[side] = {"id": m.get("id"), "name": m.get("name")}
        return out
    return out

def _fetch_coach_for_event(b: Browser, eid: int) -> Dict[str, Optional[Dict[str, Any]]]:
    data = _safe_fetch(b, f"event/{eid}/managers") or {}
    parsed = _parse_event_managers_payload(data)
    if parsed.get("home") or parsed.get("away"):
        return parsed
    return {"home": None, "away": None}

def _fetch_coach_for_team(b: Browser, team_id: int) -> Optional[Dict[str, Any]]:
    candidates = [
        f"team/{team_id}",
        f"team/{team_id}/managers",
        f"team/{team_id}/manager",
        f"team/{team_id}/coaches",
        f"team/{team_id}/staff",
        f"team/{team_id}/details",
    ]
    for path in candidates:
        data = _safe_fetch(b, path) or {}
        coach = (data.get("coach") or data.get("manager") or
                 (data.get("coaches") or [{}])[0] if isinstance(data.get("coaches"), list) else None)
        if not coach:
            for entry in (data.get("staff") or []):
                role = (entry.get("role") or entry.get("title") or "").lower()
                if "coach" in role or "manager" in role:
                    coach = entry; break
        if coach and (coach.get("id") or coach.get("name")):
            return {"id": coach.get("id"), "name": coach.get("name")}
    return None

def _enrich_one(ev: Dict[str, Any]) -> Dict[str, Any]:
    b = Browser()
    eid = _event_id(ev)
    if not eid:
        return ev
    try:
        # LINEUPS
        lj = _safe_fetch(b, f"event/{eid}/lineups") or {}
        home_side = lj.get("home") or lj.get("homeTeam") or {}
        away_side = lj.get("away") or lj.get("awayTeam") or {}

        def _pluck_players(side_obj):
            players = side_obj or {}
            players = players.get("players") if isinstance(players, dict) else players
            if not isinstance(players, list): return []
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
        ev["homeFormation"] = home_side.get("formation") or lj.get("homeFormation")
        ev["awayFormation"] = away_side.get("formation") or lj.get("awayFormation")

        # team sofascore id-jevi
        ev["home_team_sofa"] = (home_side.get("team") or {}).get("id") or (lj.get("homeTeam") or {}).get("id") or (ev.get("homeTeam") or {}).get("id")
        ev["away_team_sofa"] = (away_side.get("team") or {}).get("id") or (lj.get("awayTeam") or {}).get("id") or (ev.get("awayTeam") or {}).get("id")

        # MANAGERS
        mgrs = _fetch_coach_for_event(b, eid)
        ch = mgrs.get("home") or (home_side.get("coach") or home_side.get("manager") or {})
        ca = mgrs.get("away") or (away_side.get("coach") or away_side.get("manager") or {})
        if (not ch) and ev.get("home_team_sofa"):
            ch = _fetch_coach_for_team(b, int(ev["home_team_sofa"])) or {}
        if (not ca) and ev.get("away_team_sofa"):
            ca = _fetch_coach_for_team(b, int(ev["away_team_sofa"])) or {}
        ev["coaches"] = {"home": ({"id": ch.get("id"), "name": ch.get("name")} if ch else None),
                         "away": ({"id": ca.get("id"), "name": ca.get("name")} if ca else None)}
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
            if not team_side: continue
            evts.append({
                "minute": _as_min(inc.get("time") or inc.get("minute") or (inc.get("playerOffTime") or {}).get("minute")),
                "type": (inc.get("incidentType") or inc.get("type") or "event"),
                "player_name": (inc.get("player") or {}).get("name") or inc.get("playerName"),
                "team": team_side,
                "description": inc.get("text") or inc.get("description"),
                "card_color": (inc.get("color") or inc.get("card") or inc.get("cardColor")),
            })
        if evts: ev["events"] = evts

        # PLAYER STATISTICS (raw)
        ps = _safe_fetch(b, f"event/{eid}/player-statistics") \
             or _safe_fetch(b, f"event/{eid}/player-statistics/overall") \
             or _safe_fetch(b, f"event/{eid}/player-ratings") \
             or {}
        ev["_raw_player_stats"] = ps or {}
        if ps:
            logger.info("[player-stats] pronađen raw payload")

        # SHOTMAP (raw)
        sm = _fetch_shotmap(b, eid) or {}
        ev["_raw_shots"] = sm or {}
        if sm:
            logger.info("[shotmap] pronađen raw payload")

        # AVERAGE POSITIONS (raw) — best-effort
        ap = _fetch_avg_positions(b, eid) or {}
        ev["_raw_avg_positions"] = ap or {}
        if ap:
            logger.info("[avg-positions] pronađen raw payload")

        return ev
    finally:
        try: b.close()
        except Exception: pass

# ===================== MAIN =====================
def main():
    logger.info(f"[debug_one_event] Target event: {EVENT_ID}")

    # DB health
    db.health_check()
    db.performance_check()

    # locate event
    raw_all = _fetch_all_today()
    base = next((ev for ev in raw_all if _event_id(ev) == EVENT_ID), None)
    if not base:
        logger.error(f"Event {EVENT_ID} nije u današnjem live/scheduled snapshotu.")
        sys.exit(2)

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

    # Fallbacks
    if not pstats_temp:
        pstats_temp = _build_player_stats_from_raw(enriched)
        if not pstats_temp:
            pstats_temp = _build_player_stats_from_lineups_and_incidents(enriched)
    if not mstats_temp:
        mstats_temp = _build_match_stats_from_raw(enriched)
        if not mstats_temp:
            mstats_temp = _build_match_stats_lite_from_events(enriched)

    # NEW: shots + avg positions from raw
    shots_temp = _build_shots_from_raw(enriched)
    avgpos_temp = _build_avg_positions_from_raw(enriched)

    logger.info(
        "[parsed] comps=%s teams=%s players=%s matches=%s lineups=%s formations=%s events=%s pstats=%s mstats=%s shots=%s avgpos=%s",
        len(comps), len(teams), len(players), len(matches),
        len(lineups_temp), len(formations_temp), len(events_temp), len(pstats_temp), len(mstats_temp),
        len(shots_temp), len(avgpos_temp)
    )

    # upserts
    ok, fail = db.upsert_competitions(comps); logger.info(f"✅ competitions: ok={ok} fail={fail}")
    ok, fail = db.upsert_teams(teams);       logger.info(f"✅ teams:         ok={ok} fail={fail}")

    # ---- maps ----
    team_sofas = [t.get("sofascore_id") for t in teams if t.get("sofascore_id")]
    team_map = db.get_team_ids_by_sofa(team_sofas)

    comp_sofas = [c.get("sofascore_id") for c in comps if c.get("sofascore_id")]
    comp_map = {}
    _client = getattr(db, "client", None) or getattr(db, "_client", None)
    if _client and comp_sofas:
        try:
            res = _client.table("competitions").select("id,sofascore_id").in_("sofascore_id", comp_sofas).execute()
            comp_map = {row["sofascore_id"]: row["id"] for row in (res.data or [])}
        except Exception as ex:
            logger.warning(f"⚠️ comp map fetch failed: {ex}")

    for m in matches:
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
        elif isinstance(m.get("season"), str) and m["season"].startswith("{"):
            try:
                import json
                s = json.loads(m["season"])
                m["season"] = s.get("name") or s.get("year")
            except Exception:
                pass

    ok, fail = db.batch_upsert_matches(matches); logger.info(f"✅ matches:       ok={ok} fail={fail}")

    pairs: List[Tuple[str, int]] = []
    for m in matches:
        if m.get("source") and m.get("source_event_id") is not None:
            pairs.append((m["source"], int(m["source_event_id"])))
    match_map = db.get_match_ids_by_source_ids(pairs)

    # include pstats_temp jer može imati i igrače kojih nema u lineups
    player_sofas = [x.get("player_sofascore_id") for x in lineups_temp] + [x.get("player_sofascore_id") for x in pstats_temp]
    # dopuni i iz shotova/avg pos
    player_sofas += [x.get("player_sofascore_id") for x in shots_temp if x.get("player_sofascore_id")]
    player_sofas += [x.get("assist_player_sofascore_id") for x in shots_temp if x.get("assist_player_sofascore_id")]
    player_sofas += [x.get("player_sofascore_id") for x in avgpos_temp if x.get("player_sofascore_id")]
    player_sofas = [p for p in player_sofas if p]
    player_map = db.get_player_ids_by_sofa(player_sofas)

    # backfill players.team_id (UPDATE)
    backfill = []
    for lu in lineups_temp:
        pid = lu.get("player_sofascore_id")
        tid_sofa = lu.get("team_sofascore_id")
        if pid in player_map and tid_sofa in team_map:
            backfill.append({"sofascore_id": int(pid), "team_id": team_map[tid_sofa]})
    if backfill:
        ok = fail = 0
        if not _client:
            logger.warning("⚠️ Nemam supabase client na db objektu; preskačem players backfill.")
        else:
            for row in backfill:
                try:
                    _client.table("players").update({"team_id": row["team_id"]}).eq("sofascore_id", row["sofascore_id"]).execute()
                    ok += 1
                except Exception as ex:
                    fail += 1
                    logger.error(f"players.team_id UPDATE fail for {row['sofascore_id']}: {ex}")
        logger.info(f"♻️ players.team_id backfill (UPDATE): ok={ok} fail={fail}")

    def _mid(obj):
        obj.setdefault("source", "sofascore")
        if obj.get("source_event_id") is None:
            obj["source_event_id"] = EVENT_ID
        s = obj.get("source"); sid = obj.get("source_event_id")
        return match_map.get((s, int(sid))) if s and sid is not None else None

    # --- managers (coaches) ---
    coaches = enriched.get("coaches") or {}
    mgr_payload: List[Dict[str, Any]] = []
    for side in ("home","away"):
        c = coaches.get(side)
        tid_sofa = enriched.get(f"{side}_team_sofa")
        if c and (c.get("id") or c.get("name")):
            mgr = {"full_name": c.get("name")}
            if c.get("id"): mgr["sofascore_id"] = int(c["id"])
            if tid_sofa in team_map: mgr["team_id"] = team_map[tid_sofa]
            mgr_payload.append(mgr)

    if mgr_payload and _client:
        try:
            try:
                _client.table("managers").upsert(mgr_payload, on_conflict="sofascore_id").execute()
            except Exception:
                _client.table("managers").upsert(mgr_payload).execute()
            logger.info(f"✅ managers: upsert={len(mgr_payload)}")
            try:
                mid = next(iter(match_map.values()), None)
                if mid:
                    sel = _client.table("managers").select("id,full_name,sofascore_id").execute().data
                    sofa_to_id = {m["sofascore_id"]: m["id"] for m in sel if m.get("sofascore_id")}
                    name_to_id = {m["full_name"]: m["id"] for m in sel}
                    links = []
                    for side in ("home","away"):
                        c = coaches.get(side)
                        if not c: continue
                        man_id = None
                        if c.get("id"):
                            try: man_id = sofa_to_id.get(int(c["id"]))
                            except Exception: man_id = None
                        if not man_id:
                            man_id = name_to_id.get(c.get("name"))
                        if not man_id: continue
                        links.append({
                            "match_id": mid,
                            "manager_id": man_id,
                            "team_id": team_map.get(enriched.get(f"{side}_team_sofa")),
                            "side": side,
                        })
                    if links:
                        _client.table("match_managers").upsert(links, on_conflict="match_id,manager_id").execute()
                        logger.info(f"✅ match_managers: upsert={len(links)}")
                    else:
                        logger.info("ℹ️ match_managers: nema linkova (nije pronađen managers.id)")
            except Exception as ex:
                logger.warning(f"ℹ️ match_managers link skipped: {ex}")
        except Exception as ex:
            logger.error(f"managers upsert failed: {ex}")
    elif not mgr_payload:
        logger.info("ℹ️ managers: nema podataka (ni u event/managers ni preko team/*)")
    else:
        logger.warning("⚠️ No supabase client on db; skipping managers upsert.")

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

    # --- events (normalize) ---
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
            "xg": s.get("xg"), "xa": s.get("xa"), "saves": s.get("saves"),
            "updated_at": s.get("updated_at") or datetime.now(timezone.utc).isoformat(),
        })
    ok, fail = db.upsert_match_stats(mstats); logger.info(f"✅ match_stats:   ok={ok} fail={fail}")

    # --- SHOTS ---
    shots_payload = []
    for r in shots_temp:
        mid = _mid(r)
        if not mid: continue
        tid = team_map.get(r.get("team_sofascore_id"))
        pid = player_map.get(r.get("player_sofascore_id"))
        aid = player_map.get(r.get("assist_player_sofascore_id")) if r.get("assist_player_sofascore_id") else None
        if not (pid and tid):
            continue
        shots_payload.append({
            "match_id": mid,
            "team_id": tid,
            "player_id": pid,
            "assist_player_id": aid,
            "minute": r.get("minute"),
            "x": r.get("x"),
            "y": r.get("y"),
            "xg": r.get("xg"),
            "on_target": r.get("on_target"),
            "is_goal": r.get("is_goal"),
            "is_penalty": r.get("is_penalty"),
            "is_own_goal": r.get("is_own_goal"),
            "outcome": r.get("outcome"),
        })

    if shots_payload:
        if hasattr(db, "upsert_shots"):
            ok, fail = db.upsert_shots(shots_payload)
            logger.info(f"✅ shots:         ok={ok} fail={fail}")
        elif _client:
            try:
                # pokušaj s on_conflict ako postoji uniq indeks, inače fallback bez
                try:
                    _client.table("shots").upsert(shots_payload, on_conflict="match_id,player_id,minute,x,y").execute()
                except Exception:
                    _client.table("shots").upsert(shots_payload).execute()
                logger.info(f"✅ shots: upsert={len(shots_payload)}")
            except Exception as ex:
                logger.error(f"shots upsert failed: {ex}")
        else:
            logger.warning("⚠️ Nemam db.upsert_shots ni supabase client — preskačem shots upsert.")
    else:
        logger.info("ℹ️ shots: nema podataka")

    # --- AVG POSITIONS --- (map to public.average_positions)
    if avgpos_temp:
        avgpos_payload = []
        for r in avgpos_temp:
            mid = _mid(r)
            if not mid: continue
            tid = team_map.get(r.get("team_sofascore_id"))
            pid = player_map.get(r.get("player_sofascore_id"))
            if not (pid and tid): continue
            avgpos_payload.append({
                "match_id": mid,
                "team_id": tid,
                "player_id": pid,
                "avg_x": r.get("x"),
                "avg_y": r.get("y"),
                "touches": r.get("touches"),
                "minutes_played": r.get("minutes_played"),
            })
        if avgpos_payload:
            if hasattr(db, "upsert_avg_positions"):
                ok, fail = db.upsert_avg_positions(avgpos_payload)
                logger.info(f"✅ avg_positions: ok={ok} fail={fail}")
            elif _client:
                try:
                    _client.table("average_positions").upsert(avgpos_payload, on_conflict="match_id,player_id").execute()
                    logger.info(f"✅ average_positions: upsert={len(avgpos_payload)}")
                except Exception as ex:
                    logger.error(f"average_positions upsert failed: {ex}")
        else:
            logger.info("ℹ️ avg_positions: nema valjanih redova")
    else:
        logger.info("ℹ️ avg_positions: raw nije dostupan")

    # --- OPTIONAL: recompute player stats after shots (ako postoji RPC u bazi)
    try:
        mid = next(iter(match_map.values()), None)
        if _client and mid:
            try:
                _client.rpc("fn_recompute_players_for_match", {"p_match_id": mid}).execute()
                logger.info("🔄 fn_recompute_players_for_match OK")
            except Exception:
                # fallback: po igraču
                pids = sorted({row["player_id"] for row in shots_payload if row.get("player_id")})
                for pid in pids:
                    try:
                        _client.rpc("fn_recompute_player_in_match", {"p_match_id": mid, "p_player_id": pid}).execute()
                    except Exception:
                        pass
                if pids:
                    logger.info(f"🔄 recompute per-player tried, players={len(pids)}")
    except Exception as ex:
        logger.warning(f"ℹ️ recompute skipped: {ex}")

    logger.info("✅ Done.")

if __name__ == "__main__":
    main()
