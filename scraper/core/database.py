# scraper/core/database.py
from __future__ import annotations

import time
from typing import List, Dict, Any, Optional, Tuple, Iterable, Set
from datetime import datetime, timezone, timedelta

from supabase import create_client, Client
from .config import config
from utils.logger import get_logger

logger = get_logger(__name__)

# ------------------------- status scoring & dedupe -------------------------

_STATUS_PRIO = {
    "finished": 5, "ft": 5,
    "live": 4, "inprogress": 4, "in_progress": 4,
    "ht": 3,
    "postponed": 2, "canceled": 2, "cancelled": 2, "abandoned": 2,
    "scheduled": 1, "upcoming": 1, "notstarted": 1, "not_started": 1,
    None: 0, "": 0,
}

def _status_score(m: Dict[str, Any]) -> int:
    return _STATUS_PRIO.get(str(m.get("status_type") or m.get("status") or "").lower(), 0)

def dedupe_matches(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not rows:
        return rows

    def better(a: Dict[str, Any], b: Dict[str, Any]) -> Dict[str, Any]:
        sa, sb = _status_score(a), _status_score(b)
        if sb != sa:
            return b if sb > sa else a
        # Prefer the row that has a concrete start_time
        has_st_a = bool(a.get("start_time"))
        has_st_b = bool(b.get("start_time"))
        if has_st_a != has_st_b:
            return a if has_st_a else b
        # Prefer the row that has concrete scores
        score_a = (a.get("home_score") is not None and a.get("away_score") is not None)
        score_b = (b.get("home_score") is not None and b.get("away_score") is not None)
        if score_a != score_b:
            return a if score_a else b
        ua = a.get("updated_at") or a.get("last_seen_at") or ""
        ub = b.get("updated_at") or b.get("last_seen_at") or ""
        chosen = b if ub > ua else a
        # If either candidate has final_* and is_finished, preserve that snapshot in chosen
        for cand in (a, b):
            try:
                if cand.get("is_finished") and cand.get("final_home_score") is not None and cand.get("final_away_score") is not None:
                    # Only overwrite if chosen lacks them
                    if chosen.get("final_home_score") is None:
                        chosen["final_home_score"] = cand.get("final_home_score")
                    if chosen.get("final_away_score") is None:
                        chosen["final_away_score"] = cand.get("final_away_score")
            except Exception:
                pass
        # Preserve venue if one candidate has it and the chosen one lacks it
        try:
            if not chosen.get("venue"):
                for cand in (a, b):
                    v = cand.get("venue")
                    if v:
                        chosen["venue"] = v
                        break
        except Exception:
            pass
        return chosen

    by_src: Dict[Tuple[str, int], Dict[str, Any]] = {}
    by_id: Dict[str, Dict[str, Any]] = {}
    no_keys: List[Dict[str, Any]] = []

    for r in rows:
        src = r.get("source")
        sid = r.get("source_event_id")
        mid = r.get("id")
        if src and sid is not None:
            key = (src, int(sid))
            keep = by_src.get(key)
            by_src[key] = r if not keep else better(keep, r)
        elif mid:
            keep = by_id.get(mid)
            by_id[mid] = r if not keep else better(keep, r)
        else:
            no_keys.append(r)

    out = list(by_src.values()) + list(by_id.values()) + no_keys
    if len(out) != len(rows):
        logger.info(f"core.database | Dedupe: {len(rows)} -> {len(out)} (-{len(rows) - len(out)})")
    return out

# ------------------------------ cleaning helpers ------------------------------

_ALLOWED = {
    "competitions": {
        "name","country","logo_url","priority","sofascore_id",
    },
    "teams": {
        "name","short_name","country","logo_url","sofascore_id",
        "primary_color","secondary_color","founded","venue","venue_capacity",
    },
    "players": {
    "full_name","position","number","team_id","nationality","age",
    "height_cm","sofascore_id","date_of_birth",
    },
    "managers": {
    "full_name","nationality","date_of_birth","team_id","sofascore_id",
    },
    "matches": {
        "home_team","away_team","home_score","away_score","start_time","status",
        "competition","source","updated_at","minute","status_type",
        "home_color","away_color","current_period_start","competition_id","season",
        "round","venue","league_priority","home_team_id","away_team_id","source_event_id",
    },
    "lineups": {
        "match_id","team_id","player_id","position","jersey_number","is_starting","is_captain",
    },
    "formations": {"match_id","team_id","formation"},
    "match_events": {"match_id","minute","event_type","player_name","team","description"},
    "player_stats": {
    "match_id","player_id","team_id",
    "goals","assists",
    "shots_total","shots_on_target",
    "passes","tackles",
    "rating","minutes_played","touches",
    "is_substitute","was_subbed_in","was_subbed_out",
    },
    "match_stats": {
        "match_id","team_id","possession","shots_total","shots_on_target","corners","fouls",
        "offsides","yellow_cards","red_cards","passes","pass_accuracy","xg","saves",
        "updated_at",
    },
    "standings": {
    "competition_id","season","team_id","rank","played","wins","draws","losses",
    "goals_for","goals_against","points","updated_at",
    },
    "match_managers": {"match_id","manager_id","team_id","side"},

    # average_positions no longer stores touches/minutes (moved to player_stats)
    "average_positions": {"match_id","player_id","team_id","avg_x","avg_y"},
    "shots": {
    "match_id","team_id","player_id","assist_player_id",
    "minute","x","y","xg",
        "body_part","situation",
        "is_penalty","is_own_goal","outcome",
        "source","source_event_id","source_item_id",
    },
}

_INT_FIELDS: Dict[str, Set[str]] = {
    "players": {"number","age","height_cm"},
    "lineups": {"jersey_number"},
    "player_stats": {"goals","assists","shots_total","shots_on_target","yellow_cards","red_cards",
                     "passes","tackles","minutes_played","touches"},
    "match_events": {"minute"},
    "match_stats": {"possession","shots_total","shots_on_target","corners","fouls","offsides",
                    "yellow_cards","red_cards","passes","pass_accuracy","saves"},
    "standings": {"rank","played","wins","draws","losses","goals_for","goals_against","points"},
    "matches": {"minute","home_score","away_score","league_priority","current_period_start"},
    # average_positions now only has numeric coords (handled in _FLOAT_FIELDS)
    "average_positions": set(),
    "shots": {"minute","source_event_id","source_item_id"},
}
_FLOAT_FIELDS: Dict[str, Set[str]] = {
    "player_stats": {"rating"},
    "match_stats": {"xg"},
    "shots": {"xg","x","y"},
    "average_positions": {"avg_x","avg_y"},
}

def _to_int(v: Any) -> Optional[int]:
    if v is None:
        return None
    if isinstance(v, bool):
        return int(v)
    if isinstance(v, int):
        return v
    try:
        if isinstance(v, str):
            s = v.strip()
            if not s:
                return None
            s = s.replace("%", "").replace(",", "")
            return int(float(s))
        return int(v)
    except Exception:
        return None

def _to_float(v: Any) -> Optional[float]:
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    try:
        if isinstance(v, str):
            s = v.strip()
            if not s:
                return None
            s = s.replace("%", "").replace(",", "")
            return float(s)
        return float(v)
    except Exception:
        return None

def _clean_rows(table: str, rows: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    allowed = _ALLOWED[table]
    int_fields = _INT_FIELDS.get(table, set())
    float_fields = _FLOAT_FIELDS.get(table, set())
    out = []
    for r in rows:
        if not isinstance(r, dict):
            continue
        cleaned: Dict[str, Any] = {}
        for k, v in r.items():
            if k not in allowed:
                continue
            # normalize blanks
            if isinstance(v, str) and not v.strip():
                v = None
            # table-specific normalizations
            if table == "matches":
                # Ensure season is a simple string (name/year), not a whole object
                if k == "season" and isinstance(v, dict):
                    v = v.get("name") or v.get("year")
                # Normalize round from nested objects
                if k == "round" and isinstance(v, dict):
                    v = v.get("round")
                if k == "current_period_start" and isinstance(v, str):
                    # Attempt ISO8601 -> epoch seconds conversion for BIGINT column
                    try:
                        from datetime import datetime
                        dt = datetime.fromisoformat(v.replace("Z","+00:00"))
                        v = int(dt.timestamp())
                    except Exception:
                        v = None
            elif table == "players" and k == "date_of_birth" and v is not None:
                # DB column is integer (year). Accept YYYY, YYYY-MM-DD, or timestamp.
                try:
                    if isinstance(v, (int, float)):
                        # treat as epoch seconds -> extract year if plausible range
                        ts = int(v)
                        if ts > 10**8 or ts < -10**8:  # looks like epoch
                            from datetime import datetime
                            v = datetime.utcfromtimestamp(ts).year
                        else:
                            # already maybe a year number
                            v = int(str(ts)[:4])
                    elif isinstance(v, str):
                        yr = None
                        if v.isdigit() and len(v) >= 4:
                            yr = int(v[:4])
                        elif len(v) >= 4:
                            # take first 4 digit sequence
                            import re
                            m = re.search(r"(19|20)\d{2}", v)
                            if m:
                                yr = int(m.group(0))
                        if yr:
                            v = yr
                        else:
                            v = None
                    # basic sanity
                    if isinstance(v, int) and (1800 <= v <= datetime.utcnow().year):
                        pass
                    else:
                        v = None
                except Exception:
                    v = None
            # numeric coercion
            if k in int_fields:
                v = _to_int(v)
            elif k in float_fields:
                v = _to_float(v)
            if v is not None:
                cleaned[k] = v
        if cleaned:
            out.append(cleaned)
    return out

# ------------------------------ DB client ------------------------------

class DatabaseClient:
    def __init__(self):
        logger.info("core.database | Initializing Supabase client…")
        self.client: Client = create_client(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY)
        logger.info("core.database | ✅ Supabase ready")

    # --- health/perf ---
    def health_check(self) -> bool:
        try:
            self.client.table("matches").select("id").limit(1).execute()
            logger.info("core.database | ✅ DB connection OK")
            return True
        except Exception as e:
            logger.error(f"core.database | ❌ DB health check failed: {e}")
            return False

    def performance_check(self) -> bool:
        try:
            t0 = time.time()
            self.client.table("matches").select("id").limit(1).execute()
            dt = time.time() - t0
            if dt > 2.0:
                logger.warning(f"core.database | ⚠️ Slow DB response ({dt:.2f}s)")
                return False
            logger.info(f"core.database | ✅ DB perf OK ({dt:.2f}s)")
            return True
        except Exception as e:
            logger.error(f"core.database | DB perf failed: {e}")
            return False

    # --- generic upsert with logging ---
    def _upsert(
        self,
        table: str,
        payload: Any,
        on_conflict: str,
        ignore_duplicates: Optional[bool] = None
    ) -> tuple[int, int]:
        if not payload:
            return (0, 0)
        try:
            if isinstance(payload, dict):
                payload = [payload]
            if ignore_duplicates is None:
                resp = self.client.table(table).upsert(payload, on_conflict=on_conflict).execute()
            else:
                resp = self.client.table(table).upsert(
                    payload,
                    on_conflict=on_conflict,
                    ignore_duplicates=ignore_duplicates
                ).execute()
            n = len(resp.data or [])
            return (n, max(0, len(payload) - n))
        except Exception as e:
            logger.exception(f"core.database | Upsert into {table} failed: {e}")
            return (0, len(payload))

    # -------------------- lookup mapping helpers --------------------

    def _map_generic(self, table: str, key_col: str, ids: Iterable[int]) -> Dict[int, str]:
        out: Dict[int, str] = {}
        vals = sorted(set([int(x) for x in ids if x is not None]))
        if not vals:
            return out
        CHUNK = 300
        for i in range(0, len(vals), CHUNK):
            chunk = vals[i:i+CHUNK]
            res = (
                self.client.table(table)
                .select(f"id,{key_col}")
                .in_(key_col, chunk)
                .execute()
            )
            for r in res.data or []:
                out[int(r[key_col])] = r["id"]
            missing = [x for x in chunk if x not in out]
            if missing:
                res2 = (
                    self.client.table(table)
                    .select(f"id,{key_col}")
                    .in_(key_col, [str(x) for x in missing])
                    .execute()
                )
                for r in res2.data or []:
                    try:
                        key = int(r[key_col])
                    except Exception:
                        key = r[key_col]
                    out[key] = r["id"]
        return out

    def get_team_ids_by_sofa(self, sofa_ids: Iterable[int]) -> Dict[int, str]:
        m = self._map_generic("teams", "sofascore_id", sofa_ids)
        logger.info(f"core.database | [teams map] asked={len(set(x for x in sofa_ids if x))} -> mapped={len(m)}")
        return m

    def get_player_ids_by_sofa(self, sofa_ids: Iterable[int]) -> Dict[int, str]:
        m = self._map_generic("players", "sofascore_id", sofa_ids)
        logger.info(f"core.database | [players map] asked={len(set(x for x in sofa_ids if x))} -> mapped={len(m)}")
        return m

    def get_manager_ids_by_sofa(self, sofa_ids: Iterable[int]) -> Dict[int, str]:
        m = self._map_generic("managers", "sofascore_id", sofa_ids)
        logger.info(f"core.database | [managers map] asked={len(set(x for x in sofa_ids if x))} -> mapped={len(m)}")
        return m

    def get_competition_ids_by_sofa(self, sofa_ids: Iterable[int]) -> Dict[int, str]:
        return self._map_generic("competitions", "sofascore_id", sofa_ids)

    # alias za postojeće pozive u kodu
    def map_competitions_by_sofa(self, sofa_ids: List[int]) -> Dict[int, str]:
        try:
            return self.get_competition_ids_by_sofa(sofa_ids or [])
        except Exception as ex:
            logger.warning(f"core.database | [competitions map] failed: {ex}")
            return {}

    def get_match_ids_by_source_ids(
        self,
        pairs: Iterable[Tuple[str, int | str]],
    ) -> Dict[Tuple[str, int], str]:
        """
        Vrati mapu {(source, source_event_id) -> match_id} za zadane parove.
        Query ide grupirano po 'source' i chunkano preko IN(source_event_id).
        """
        by_source: Dict[str, List[int]] = {}
        for src, sid in pairs or []:
            if not src or sid is None:
                continue
            try:
                n_sid = int(sid)
            except Exception:
                continue
            by_source.setdefault(src, []).append(n_sid)

        out: Dict[Tuple[str, int], str] = {}
        if not by_source:
            logger.info("core.database | [matches map] nothing to map")
            return out

        CHUNK = 300
        for src, id_list in by_source.items():
            ids = sorted(set(id_list))
            for i in range(0, len(ids), CHUNK):
                chunk = ids[i:i+CHUNK]
                try:
                    res = (
                        self.client.table("matches")
                        .select("id,source,source_event_id")
                        .eq("source", src)
                        .in_("source_event_id", chunk)
                        .execute()
                    )
                    for r in res.data or []:
                        try:
                            key = (r["source"], int(r["source_event_id"]))
                        except Exception:
                            try:
                                key = (r["source"], int(str(r["source_event_id"]).strip()))
                            except Exception:
                                continue
                        out[key] = r["id"]
                except Exception as ex:
                    logger.error(f"core.database | [matches map] query failed for source={src}: {ex}")

        logger.info(
            f"core.database | [matches map] asked={sum(len(v) for v in by_source.values())} -> mapped={len(out)}"
        )
        return out

    # -------------------- upserts per table --------------------

    def upsert_competitions(self, rows: List[Dict[str, Any]]) -> tuple[int, int]:
        clean = _clean_rows("competitions", rows)
        if not clean:
            return (0, 0)
        tmp: Dict[Any, Dict[str, Any]] = {}
        for c in clean:
            key = c.get("sofascore_id") or (c.get("name"), c.get("country"))
            if not key:
                continue
            prev = tmp.get(key)
            if not prev or (c.get("logo_url") and not prev.get("logo_url")) or (c.get("priority") and not prev.get("priority")):
                tmp[key] = c
        payload = list(tmp.values())
        return self._upsert("competitions", payload, on_conflict="sofascore_id")

    def upsert_teams(self, rows: List[Dict[str, Any]]) -> tuple[int, int]:
        clean = _clean_rows("teams", rows)
        if not clean:
            return (0, 0)
        tmp: Dict[Any, Dict[str, Any]] = {}
        for t in clean:
            k = t.get("sofascore_id")
            if k is None:
                continue
            tmp[k] = t
        payload = list(tmp.values())
        return self._upsert("teams", payload, on_conflict="sofascore_id")

    def upsert_players(self, rows: List[Dict[str, Any]]) -> tuple[int, int]:
        """
        Safe players upsert:
        - 'rich' rows s full_name -> normal upsert (insert/update)
        - 'lean' rows bez full_name -> UPDATE only (bez insert-a koji bi kršio NOT NULL)
        Preferiraj redove koji nose team_id kad dedupiraš.
        """
        clean = _clean_rows("players", rows)
        if not clean:
            return (0, 0)
        tmp: Dict[Any, Dict[str, Any]] = {}
        for p in clean:
            k = p.get("sofascore_id")
            if k is None:
                continue
            prev = tmp.get(k)
            if not prev or (p.get("team_id") and not prev.get("team_id")):
                tmp[k] = p
        payload = list(tmp.values())

        rich = [p for p in payload if p.get("full_name")]
        lean = [p for p in payload if not p.get("full_name")]

        ok_rich = fail_rich = 0
        if rich:
            ok_rich, fail_rich = self._upsert("players", rich, on_conflict="sofascore_id")

        # lean -> update only (per row)
        updated = skipped = failed = 0
        for p in lean:
            sid = p.get("sofascore_id")
            if not sid:
                continue
            upd = {k: v for k, v in p.items() if k != "sofascore_id"}
            if not upd:
                skipped += 1
                continue
            try:
                res = self.client.table("players").update(upd).eq("sofascore_id", sid).execute()
                if res.data and len(res.data) > 0:
                    updated += len(res.data)
                else:
                    skipped += 1
            except Exception as e:
                failed += 1
                logger.error(f"core.database | players UPDATE fail for sofascore_id={sid}: {e}")

        total_ok = ok_rich + updated
        total_fail = fail_rich + failed
        logger.info(
            f"core.database | players upsert: rich_ok={ok_rich} rich_fail={fail_rich} updated={updated} skipped={skipped} failed={failed}"
        )
        return (total_ok, total_fail)

    def upsert_managers(self, rows: List[Dict[str, Any]]) -> tuple[int, int]:
        """
        Upsert managers respecting the UNIQUE constraint on sofascore_id.

        Strategy change (fix duplicate key 23505 on managers_sofascore_id_key):
        - If row has sofascore_id -> ALWAYS upsert on sofascore_id (even if full_name/team_id present). This prevents
          inserts that would violate the unique index when using a different conflict target (full_name,team_id).
        - Rows without sofascore_id but with (full_name AND team_id) -> upsert on (full_name,team_id).
        - Rows without any reliable key are skipped.
        Dedupe inside each bucket preferring richer rows (nationality, birth_date, team_id).
        """
        # Normalize legacy key 'birth_date' -> 'date_of_birth'
        norm_rows: List[Dict[str, Any]] = []
        for r in rows:
            if isinstance(r, dict):
                if "birth_date" in r and "date_of_birth" not in r:
                    r = {**r, "date_of_birth": r.get("birth_date")}
            norm_rows.append(r)
        clean = _clean_rows("managers", norm_rows)
        try:
            total_raw = len(norm_rows)
            total_clean = len(clean)
            nat_raw = sum(1 for r in norm_rows if (r or {}).get("nationality"))
            dob_raw = sum(1 for r in norm_rows if (r or {}).get("date_of_birth") or (r or {}).get("birth_date"))
            nat_clean = sum(1 for r in clean if r.get("nationality"))
            dob_clean = sum(1 for r in clean if r.get("date_of_birth"))
            if total_clean:
                logger.info(
                    f"core.database | managers pre-upsert raw={total_raw} clean={total_clean} nat_raw={nat_raw} nat_clean={nat_clean} dob_raw={dob_raw} dob_clean={dob_clean}"
                )
                sample = [
                    {k: v for k, v in r.items() if k in ("sofascore_id","full_name","nationality","date_of_birth","team_id")}
                    for r in clean[:3]
                ]
                logger.debug(f"core.database | managers sample_clean={sample}")
        except Exception as _log_ex:
            logger.debug(f"core.database | managers logging skipped: {_log_ex}")
        if not clean:
            return (0, 0)
        bucket_sofa: Dict[int, Dict[str, Any]] = {}
        bucket_ft: Dict[tuple, Dict[str, Any]] = {}

        def richness(m: Dict[str, Any]) -> tuple[int, int, int]:
            # (has nationality, has date_of_birth, has team_id) for ordering
            return (
                1 if m.get("nationality") else 0,
                1 if (m.get("date_of_birth") or m.get("birth_date")) else 0,
                1 if m.get("team_id") else 0,
            )

        for m in clean:
            sid = m.get("sofascore_id")
            if sid is not None:  # primary bucket
                prev = bucket_sofa.get(sid)
                if not prev or richness(m) > richness(prev):
                    bucket_sofa[sid] = m
                continue
            fname = (m.get("full_name") or "").strip().lower()
            tid = m.get("team_id")
            if fname and tid:  # only if we lack sofascore_id
                key = (fname, tid)
                prev = bucket_ft.get(key)
                if not prev or richness(m) > richness(prev):
                    bucket_ft[key] = m

        payload_sid = list(bucket_sofa.values())
        payload_ft = list(bucket_ft.values())

        ok = fail = 0
        # PRE-FLIGHT: attempt in-place updates for rows whose (full_name,team_id) already exist to avoid
        # violating the managers_fullname_team_unique constraint when we later upsert on sofascore_id.
        sid_insert_candidates: List[Dict[str, Any]] = []
        pre_updated = pre_failed = 0
        for m in payload_sid:
            fname = m.get("full_name")
            tid = m.get("team_id")
            if fname and tid:
                # Only attempt update where an existing row matches by (full_name,team_id).
                # We update even if that row already has a (different) sofascore_id to consolidate data;
                # if that would clash with another row having the incoming sofascore_id we'll log and skip.
                upd = {k: v for k, v in m.items() if k != "sofascore_id" and v is not None}
                # fetch current row to avoid downgrading non-null to null
                try:
                    cur = (
                        self.client.table("managers")
                        .select("nationality,date_of_birth")
                        .eq("full_name", fname)
                        .eq("team_id", tid)
                        .limit(1)
                        .execute()
                    )
                    if cur.data:
                        cur0 = cur.data[0]
                        if cur0.get("nationality") and not upd.get("nationality"):
                            upd.pop("nationality", None)
                        if cur0.get("date_of_birth") and not upd.get("date_of_birth"):
                            upd.pop("date_of_birth", None)
                except Exception:
                    pass
                upd["sofascore_id"] = m.get("sofascore_id")
                try:
                    res = (
                        self.client.table("managers")
                        .update(upd)
                        .eq("full_name", fname)
                        .eq("team_id", tid)
                        .execute()
                    )
                    if res.data and len(res.data) > 0:
                        pre_updated += len(res.data)
                        ok += len(res.data)
                        continue  # don't include in insert candidates
                except Exception as ex:
                    pre_failed += 1
                    logger.warning(f"core.database | managers pre-update failed full_name={fname} team_id={tid}: {ex}")
            sid_insert_candidates.append(m)

        if sid_insert_candidates:  # now safe to bulk upsert remaining by sofascore_id
            # Remove nulls that would overwrite existing non-null values during conflict update
            sid_clean = []
            for m in sid_insert_candidates:
                sid_clean.append({k: v for k, v in m.items() if v is not None})
            s_ok, s_fail = self._upsert("managers", sid_clean, on_conflict="sofascore_id")
            ok += s_ok; fail += s_fail
        if payload_ft:
            ft_ok, ft_fail = self._upsert("managers", payload_ft, on_conflict="full_name,team_id")
            ok += ft_ok; fail += ft_fail
        if pre_updated or pre_failed:
            logger.info(
                f"core.database | managers pre-update existing name+team updated={pre_updated} failed={pre_failed}"
            )
        logger.info(
            f"core.database | managers upsert sofascore={len(payload_sid)} name_team_only={len(payload_ft)} inserted_sid={len(sid_insert_candidates)} ok={ok} fail={fail}"
        )
        return (ok, fail)

    def upsert_match_managers(self, data, match_map: dict | None = None, team_map: dict | None = None) -> tuple[int, int]:
        """
        Dvije upotrebe:
        1) upsert_match_managers(rows)  -> rows su već u obliku {match_id, manager_id, team_id?, side}
        2) upsert_match_managers(coaches, match_map, team_map)
            - coaches je dict s ključevima 'home'/'away' (ili prazno/None)
            - match_map je {(source, source_event_id) -> match_id} (za debug_one_event normalno 1 komad)
            - team_map je {team_sofa_id -> team_uuid} (može biti prazan)
        """
        # --- varijanta (1): već pripremljeni redovi
        if match_map is None and team_map is None:
            rows = data if isinstance(data, list) else (data or [])
            clean = _clean_rows("match_managers", rows)
            if not clean:
                return (0, 0)
            tmp: Dict[Tuple[str, str], Dict[str, Any]] = {}
            for r in clean:
                k = (r.get("match_id"), r.get("manager_id"))
                if not all(k):
                    continue
                tmp[k] = r
            payload = list(tmp.values())
            return self._upsert("match_managers", payload, on_conflict="match_id,manager_id")

        # --- varijanta (2): coaches + mape
        coaches = data or {}
        if not isinstance(coaches, dict):
            return (0, 0)

        # pokušaj izvući match_id (u debug_one_event je samo jedan par)
        match_id: Optional[str] = None
        if match_map:
            try:
                match_id = next(iter(match_map.values()))
            except StopIteration:
                match_id = None

        # izvući potencijalne sofascore id-jeve managera i timova iz coaches strukture
        def _extract(coach_entry) -> tuple[Optional[int], Optional[int]]:
            """
            Vrati (manager_sofa_id, team_sofa_id) iz raznih mogućih oblika payloada.
            Podržava:
            { 'id': <mgr_sofa>, 'team': {'id': <team_sofa>} }
            { 'manager': {'id': <mgr_sofa>}, 'teamId': <team_sofa> }
            { 'sofascore_id': ..., 'team_sofascore_id': ... }
            """
            if not isinstance(coach_entry, dict):
                return (None, None)
            # manager
            mgr_sofa = coach_entry.get("sofascore_id") or coach_entry.get("id")
            if not mgr_sofa and isinstance(coach_entry.get("manager"), dict):
                mgr_sofa = coach_entry["manager"].get("sofascore_id") or coach_entry["manager"].get("id")
            # team
            team_sofa = coach_entry.get("team_sofascore_id") or coach_entry.get("teamId")
            if not team_sofa and isinstance(coach_entry.get("team"), dict):
                team_sofa = coach_entry["team"].get("sofascore_id") or coach_entry["team"].get("id")
            try:
                mgr_sofa = int(mgr_sofa) if mgr_sofa is not None else None
            except Exception:
                mgr_sofa = None
            try:
                team_sofa = int(team_sofa) if team_sofa is not None else None
            except Exception:
                team_sofa = None
            return (mgr_sofa, team_sofa)

        sides = []
        if "home" in coaches: sides.append(("home", coaches.get("home")))
        if "away" in coaches: sides.append(("away", coaches.get("away")))

        # skupimo sve manager sofascore id-jeve koje trebamo mapirati u UUID
        mgr_sofas = []
        tmp_rows: List[Dict[str, Any]] = []
        for side, entry in sides:
            if not entry:
                continue
            mgr_sofa, team_sofa = _extract(entry)
            if mgr_sofa:
                mgr_sofas.append(mgr_sofa)
                tmp_rows.append({
                    "match_id": match_id,
                    "manager_sofa": mgr_sofa,
                    "team_sofa": team_sofa,
                    "side": side
                })

        if not tmp_rows:
            return (0, 0)

        mgr_map = self.get_manager_ids_by_sofa(mgr_sofas)  # {sofa -> manager_uuid}

        rows: List[Dict[str, Any]] = []
        for r in tmp_rows:
            manager_uuid = mgr_map.get(r["manager_sofa"])
            team_uuid = None
            if team_map and r.get("team_sofa") is not None:
                team_uuid = team_map.get(r["team_sofa"])
            row = {
                "match_id": r.get("match_id"),
                "manager_id": manager_uuid,
                "team_id": team_uuid,
                "side": r.get("side"),
            }
            # zahtijevamo barem match_id + manager_id
            if row["match_id"] and row["manager_id"]:
                rows.append(row)

        if not rows:
            return (0, 0)

        clean = _clean_rows("match_managers", rows)
        if not clean:
            return (0, 0)

        # dedupe (match_id, manager_id)
        uniq: Dict[Tuple[str, str], Dict[str, Any]] = {}
        for r in clean:
            k = (r.get("match_id"), r.get("manager_id"))
            if not all(k):
                continue
            uniq[k] = r
        payload = list(uniq.values())
        return self._upsert("match_managers", payload, on_conflict="match_id,manager_id")

    def backfill_players_team(self, items: List[Dict[str, Any]]) -> tuple[int, int]:
        """UPDATE only: set players.team_id by sofascore_id (no inserts)."""
        if not items:
            return (0, 0)
        updated = failed = 0
        for it in items:
            sid = it.get("sofascore_id")
            tid = it.get("team_id")
            if not (sid and tid):
                continue
            try:
                res = self.client.table("players").update({"team_id": tid}).eq("sofascore_id", sid).execute()
                if res.data and len(res.data) > 0:
                    updated += len(res.data)
            except Exception as e:
                failed += 1
                logger.error(f"core.database | players.team_id UPDATE fail for sofascore_id={sid}: {e}")
        logger.info(f"core.database | ✅ player team backfill: updated={updated}, skipped={len(items) - updated - failed}")
        return (updated, failed)

    def backfill_players_team_id(self, rows: List[Dict[str, Any]]) -> None:
        ok = fail = 0
        if not rows:
            logger.info("core.database | ♻️ players.team_id backfill: nothing to do")
            return
        try:
            for row in rows:
                try:
                    self.client.table("players").update({"team_id": row["team_id"]}).eq("sofascore_id", row["sofascore_id"]).execute()
                    ok += 1
                except Exception as ex:
                    fail += 1
                    logger.error(f"core.database | players.team_id UPDATE fail for {row.get('sofascore_id')}: {ex}")
        finally:
            logger.info(f"core.database | ♻️ players.team_id backfill (UPDATE): ok={ok} fail={fail}")

    def upsert_lineups(self, rows: List[Dict[str, Any]]) -> tuple[int, int]:
        clean = _clean_rows("lineups", rows)
        if not clean:
            return (0, 0)
        tmp: Dict[Tuple[str, str], Dict[str, Any]] = {}
        for r in clean:
            k = (r.get("match_id"), r.get("player_id"))
            if not all(k):
                continue
            # preferiraj (is_starting/is_captain) ako ima duplikata
            if k not in tmp:
                tmp[k] = r
            else:
                a = tmp[k]; b = r
                score_a = int(bool(a.get("is_starting"))) + int(bool(a.get("is_captain")))
                score_b = int(bool(b.get("is_starting"))) + int(bool(b.get("is_captain")))
                if score_b > score_a:
                    tmp[k] = b
        payload = list(tmp.values())
        return self._upsert("lineups", payload, on_conflict="match_id,player_id")

    def upsert_formations(self, rows: List[Dict[str, Any]]) -> tuple[int, int]:
        clean = _clean_rows("formations", rows)
        if not clean:
            return (0, 0)
        tmp: Dict[Tuple[str, str], Dict[str, Any]] = {}
        for r in clean:
            k = (r.get("match_id"), r.get("team_id"))
            if not all(k):
                continue
            tmp[k] = r
        payload = list(tmp.values())
        return self._upsert("formations", payload, on_conflict="match_id,team_id")

    def upsert_match_events(self, rows: List[Dict[str, Any]]) -> tuple[int, int]:
        clean = _clean_rows("match_events", rows)
        if not clean:
            return (0, 0)
        tmp: Dict[Tuple, Dict[str, Any]] = {}
        for r in clean:
            k = (r.get("match_id"), r.get("minute"), r.get("event_type"), r.get("team"), r.get("player_name"))
            if None in k:
                continue
            tmp[k] = r
        payload = list(tmp.values())
        return self._upsert("match_events", payload, on_conflict="match_id,minute,event_type,team,player_name")

    def upsert_player_stats(self, rows: List[Dict[str, Any]]) -> tuple[int, int]:
        clean = _clean_rows("player_stats", rows)
        if not clean:
            return (0, 0)
        tmp: Dict[Tuple[str, str], Dict[str, Any]] = {}
        for r in clean:
            k = (r.get("match_id"), r.get("player_id"))
            if not all(k):
                continue
            # prefer row with higher minutes, then rating, then touches
            if k in tmp:
                a = tmp[k]; b = r
                score_a = (a.get("minutes_played") or 0, a.get("rating") or 0, a.get("touches") or 0)
                score_b = (b.get("minutes_played") or 0, b.get("rating") or 0, b.get("touches") or 0)
                if score_b > score_a:
                    tmp[k] = b
            else:
                tmp[k] = r
        payload = list(tmp.values())
        return self._upsert("player_stats", payload, on_conflict="match_id,player_id")

    def upsert_match_stats(self, rows: List[Dict[str, Any]]) -> tuple[int, int]:
        clean = _clean_rows("match_stats", rows)
        if not clean:
            return (0, 0)
        tmp: Dict[Tuple[str, str], Dict[str, Any]] = {}
        for r in clean:
            k = (r.get("match_id"), r.get("team_id"))
            if not all(k):
                continue
            tmp[k] = r
        payload = list(tmp.values())
        return self._upsert("match_stats", payload, on_conflict="match_id,team_id")

    def upsert_shots(self, rows: List[Dict[str, Any]]) -> tuple[int, int]:
        """Upsert rows into shots.
    Conflict key: (match_id, player_id, minute, x, y, outcome)  -- kolona 'second' više ne postoji u DB.
        Returns (ok, fail). Adds verbose diagnostics to trace zero-save issues.
        """
        pre = len(rows)
        clean = _clean_rows("shots", rows)
        logger.info(
            f"core.database | shots debug incoming={pre} after_clean={len(clean)} sample={clean[:1] if clean else None}"
        )
        if not clean:
            return (0, 0)

        dedup: Dict[Tuple, Dict[str, Any]] = {}
        dropped_required = 0
        # Allowed outcomes per CURRENT DB CHECK constraint:
        #   goal,on_target,off_target,blocked,saved,woodwork,saved_off_target
        # Normalise a wider provider set into these. Anything unknown -> off_target.
        allowed_db = {"goal","on_target","off_target","blocked","saved","woodwork","saved_off_target"}
        outcome_map = {
            # direct
            "goal": "goal",
            "on_target": "on_target",
            "off_target": "off_target",
            "blocked": "blocked",
            "saved": "saved",
            "woodwork": "woodwork",
            "saved_off_target": "saved_off_target",
            # synonyms / granular
            "own_goal": "goal",  # treat own goal as goal for shot outcome summary
            "post": "woodwork",
            "bar": "woodwork",
            "blocked_deflection": "blocked",
            "keeper_saved": "saved",
            "keeper_saved_deflection": "saved",
            "saved_to_post": "saved",
            "saved_woodwork": "saved",
            # penalties
            "pen_scored": "goal",
            "pen_saved": "saved",
            "pen_miss": "off_target",
            "pen_post": "woodwork",
            "pen_bar": "woodwork",
        }
        remapped_outcomes = 0
        for r in clean:
            oc_raw = (r.get("outcome") or "").strip().lower()
            mapped = outcome_map.get(oc_raw, oc_raw)
            if mapped not in allowed_db:
                # final fallback
                if mapped not in (None, ""):
                    remapped_outcomes += 1
                mapped = "off_target"
            if mapped != r.get("outcome"):
                remapped_outcomes += 1 if oc_raw else 0
                r["outcome"] = mapped
            # 'second' više ne postoji u tablici – ignoriramo ju ako je prisutna u inputu
            if "second" in r:
                r.pop("second", None)
            k = (
                r.get("match_id"), r.get("player_id"), r.get("minute"),
                r.get("x"), r.get("y"), r.get("outcome"),
            )
            if None in k:  # svi elementi ključa moraju postojati
                dropped_required += 1
                continue
            dedup[k] = r
        payload = list(dedup.values())
        # Whitelist columns actually present in public.shots to avoid PostgREST schema cache errors
        shots_columns = {"match_id","team_id","player_id","minute","x","y","xg","body_part","situation","is_penalty","is_own_goal","outcome","assist_player_id","source","source_event_id","source_item_id"}
        for p in payload:
            junk = [k for k in p.keys() if k not in shots_columns]
            for k in junk:
                p.pop(k, None)
        logger.info(
            f"core.database | shots payload ready size={len(payload)} dropped_required={dropped_required} distinct_keys={len(dedup)} remapped_outcomes={remapped_outcomes}"
        )
        if not payload:
            return (0, pre)
        try:
            resp = self.client.table("shots").upsert(
                payload,
                # Napomena: potreban je UNIQUE indeks nad ovim kolonama za optimalan UPSERT.
                on_conflict="match_id,player_id,minute,x,y,outcome"
            ).execute()
            returned = len(resp.data or [])
            inserted = returned if returned > 0 else len(payload)
            logger.info(
                f"core.database | shots upsert done returned={returned} assumed_inserted={inserted} first_row={payload[0] if payload else None}"
            )
            if returned == 0:
                logger.warning("core.database | shots upsert returned 0 rows (possibly no select privilege on table)")
            return (inserted, 0 if inserted == len(payload) else max(0, len(payload) - inserted))
        except Exception as e:
            msg_full = str(e)
            msg_low = msg_full.lower()
            logger.error(f"core.database | shots bulk upsert exception: {msg_full}")
            # Only treat as missing table if explicit pattern present
            if ('relation' in msg_low and 'shots' in msg_low and 'does not exist' in msg_low) or ('table' in msg_low and 'shots' in msg_low and 'not exist' in msg_low):
                logger.error("core.database | detected shots table missing based on error pattern; verify schema/search_path")
                return (0, len(payload))
            logger.warning("core.database | shots batch upsert failed, attempting per-row fallback")
            ok = fail = 0
            for idx, item in enumerate(payload):
                try:
                    self.client.table("shots").insert([item]).execute()
                    ok += 1
                except Exception as ex:
                    em = str(ex).lower()
                    if any(w in em for w in ("duplicate","unique","already exists")):
                        ok += 1
                    else:
                        fail += 1
                        if fail == 1:
                            logger.warning(f"core.database | shots insert problem: {ex} item={item}")
                        if "cross-database references" in em:
                            fail += len(payload) - idx - 1
                            break
            return (ok, fail)

    def upsert_average_positions(self, rows: List[Dict[str, Any]]) -> tuple[int, int]:
        """Store average positions (match_id, player_id, team_id, x|avg_x, y|avg_y).
        Schema change: touches / minutes_played moved to player_stats so we ignore them here.
        """
        if not rows:
            return (0, 0)

        mapped: List[Dict[str, Any]] = []
        for r in rows:
            if not (r.get("match_id") and r.get("player_id")):
                continue
            # Preserve zero coordinates (can't rely on truthiness)
            raw_x = r.get("x") if r.get("x") is not None else r.get("avg_x")
            raw_y = r.get("y") if r.get("y") is not None else r.get("avg_y")
            # Skip rows without both coordinates – would violate NOT NULL
            if raw_x is None or raw_y is None:
                continue
            mapped.append({
                "match_id": r.get("match_id"),
                "player_id": r.get("player_id"),
                "team_id": r.get("team_id"),
                "avg_x": raw_x,
                "avg_y": raw_y,
            })
        pre = len(mapped)
        clean = _clean_rows("average_positions", mapped)
        logger.debug(f"[db.upsert_average_positions] incoming={len(rows)} mapped={pre} clean={len(clean)}")
        if not clean:
            return (0, 0)

        # dedupe (match_id, player_id) – last wins
        tmp: Dict[Tuple[str, str], Dict[str, Any]] = {}
        for r in clean:
            k = (r.get("match_id"), r.get("player_id"))
            if not all(k):
                continue
            tmp[k] = r
        payload = list(tmp.values())

        try:
            self.client.table("average_positions").upsert(
                payload, on_conflict="match_id,player_id"
            ).execute()
            return (len(payload), 0)
        except Exception as e:
            logger.error(f"core.database | average_positions upsert failed: {e}")
            return (0, len(payload))

    def upsert_standings(self, rows: List[Dict[str, Any]]) -> tuple[int, int]:
        """
        Očekuje kolone:
        competition_id, season, team_id, rank, played, wins, draws, losses,
        goals_for, goals_against, points, form, updated_at
        """
        clean = _clean_rows("standings", rows)
        if not clean:
            return (0, 0)
        tmp: Dict[Tuple[str, str, str], Dict[str, Any]] = {}
        for r in clean:
            k = (r.get("competition_id"), r.get("season"), r.get("team_id"))
            if not all(k):
                continue
            tmp[k] = r
        payload = list(tmp.values())
        return self._upsert("standings", payload, on_conflict="competition_id,season,team_id")

    # -------------------- matches (batch) --------------------

    def _patch_match(self, row: Dict[str, Any]) -> None:
        src = row.get("source"); sid = row.get("source_event_id")
        if src and sid is not None:
            (self.client.table("matches")
             .update(row)
             .eq("source", src)
             .eq("source_event_id", sid)
             .execute())
            return
        rid = row.get("id")
        if rid:
            self.client.table("matches").update(row).eq("id", rid).execute()
            return
        raise ValueError("Cannot PATCH match without (source,source_event_id) or id")

    def batch_upsert_matches(self, matches: List[Dict[str, Any]], batch_size: int = 50) -> Tuple[int, int]:
        if not matches:
            return (0, 0)

        rows = dedupe_matches(_clean_rows("matches", matches))

        # ne pokušavaj upisati "skeletne" redove bez obaveznih polja
        rows = [
            m for m in rows
            if (m.get("home_team") or m.get("home_team_id")) 
            and (m.get("away_team") or m.get("away_team_id"))
        ]

        group_src = [m for m in rows if m.get("source") and m.get("source_event_id") is not None]
        group_id  = [m for m in rows if m not in group_src and m.get("id")]
        group_plain = [m for m in rows if m not in group_src and m not in group_id]

        total_ok, total_fail = 0, 0

        def _run_group(chunk_rows: List[Dict[str, Any]], on_conflict: Optional[str]) -> Tuple[int, int]:
            ok = fail = 0
            if not chunk_rows:
                return (0, 0)
            total_batches = (len(chunk_rows) + batch_size - 1) // batch_size
            for i in range(0, len(chunk_rows), batch_size):
                batch = chunk_rows[i:i+batch_size]

                # intra-batch dedupe na ključu upserta
                if on_conflict == "source,source_event_id":
                    tmp: Dict[Tuple[str, int], Dict[str, Any]] = {}
                    for m in batch:
                        k = (m["source"], int(m["source_event_id"]))
                        if k not in tmp or _status_score(m) >= _status_score(tmp[k]):
                            tmp[k] = m
                    batch = list(tmp.values())
                elif on_conflict == "id":
                    tmp2: Dict[str, Dict[str, Any]] = {}
                    for m in batch:
                        k = m["id"]
                        if k not in tmp2 or _status_score(m) >= _status_score(tmp2[k]):
                            tmp2[k] = m
                    batch = list(tmp2.values())

                for attempt in range(3):
                    try:
                        if on_conflict:
                            self._upsert("matches", batch, on_conflict=on_conflict)
                        else:
                            self.client.table("matches").insert(batch).execute()
                        ok += len(batch)
                        logger.info(f"core.database | ✅ matches batch {i//batch_size+1}/{total_batches}: {len(batch)}")
                        break
                    except Exception as e:
                        msg = str(e)
                        logger.error(f"core.database | ❌ matches batch {i//batch_size+1} attempt {attempt+1}: {msg}")
                        if attempt < 2:
                            time.sleep((attempt+1) * 2)
                        else:
                            # fallback: pojedinačno
                            for m in batch:
                                try:
                                    if on_conflict:
                                        self._upsert("matches", m, on_conflict=on_conflict)
                                    else:
                                        try:
                                            self.client.table("matches").insert(m).execute()
                                        except Exception:
                                            self._patch_match(m)
                                    ok += 1
                                except Exception as ee:
                                    fail += 1
                                    logger.error(f"core.database | match fail: {m.get('home_team')} vs {m.get('away_team')}: {ee}")
                if i + batch_size < len(chunk_rows):
                    time.sleep(0.2)
            return (ok, fail)

        ok, fail = _run_group(group_src, "source,source_event_id")
        total_ok += ok; total_fail += fail
        ok, fail = _run_group(group_id, "id")
        total_ok += ok; total_fail += fail
        ok, fail = _run_group(group_plain, None)
        total_ok += ok; total_fail += fail

        rate = (total_ok / len(rows) * 100.0) if rows else 0.0
        logger.info(f"core.database | matches upsert done: total={len(rows)} ok={total_ok} fail={total_fail} rate={rate:.1f}%")
        return (total_ok, total_fail)

    # -------------------- maintenance --------------------

    def cleanup_zombie_matches(self, hours_old: int = 3) -> int:
        try:
            now = datetime.now(timezone.utc)
            cutoff = now - timedelta(hours=hours_old)
            res = (self.client.table("matches")
                   .select("id")
                   .in_("status", ["live","ht"])
                   .lt("start_time", cutoff.isoformat())
                   .execute())
            ids = [r["id"] for r in (res.data or [])]
            if not ids:
                return 0
            (self.client.table("matches")
             .update({"status": "finished", "status_type": "finished", "minute": None, "updated_at": now.isoformat()})
             .in_("id", ids).execute())
            logger.info(f"core.database | ✅ zombies finished: {len(ids)}")
            return len(ids)
        except Exception as e:
            logger.warning(f"core.database | cleanup_zombie_matches failed: {e}")
            return 0

    def finish_overdue_upcoming(self, hours_old: int = 3) -> int:
        try:
            now = datetime.now(timezone.utc)
            cutoff = now - timedelta(hours=hours_old)
            statuses = ["upcoming","scheduled","notstarted","not_started","ns"]
            res = (self.client.table("matches")
                   .update({"status":"finished","status_type":"finished","minute":None,"updated_at":now.isoformat()})
                   .in_("status", statuses)
                   .lt("start_time", cutoff.isoformat()).execute())
            updated = len(res.data or [])
            logger.info(f"core.database | ✅ force-finished upcoming: {updated}")
            return updated
        except Exception as e:
            logger.warning(f"core.database | finish_overdue_upcoming failed: {e}")
            return 0

# shared instance
db = DatabaseClient()