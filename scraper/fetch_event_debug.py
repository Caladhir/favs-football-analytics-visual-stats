from __future__ import annotations
import json
from datetime import datetime, timezone
try:
    from zoneinfo import ZoneInfo
    try:
        LOCAL_TZ = ZoneInfo("Europe/Zagreb")
    except Exception:
        # system tzdata not present or zone missing; fallback to fixed +02:00
        from datetime import timezone, timedelta
        LOCAL_TZ = timezone(timedelta(hours=2))
except Exception:
    # older Python / no zoneinfo => fallback to fixed +02:00
    from datetime import timezone, timedelta
    LOCAL_TZ = timezone(timedelta(hours=2))

# Ako već koristiš svoj headless fetcher:
from core.browser import Browser  # koristi isti koji ti prolazi CF zaštitu

def deep_get(d: dict, *path):
    cur = d
    for k in path:
        if not isinstance(cur, dict):
            return None
        cur = cur.get(k)
    return cur

def to_int_or_none(x):
    try:
        if x is None:
            return None
        if isinstance(x, (int, float)):
            return int(x)
        s = str(x).strip()
        if s == "":
            return None
        return int(float(s))
    except Exception:
        return None

def parse_start_timestamp(ev_like: dict) -> int | None:
    """
    Vrati startTimestamp u sekundama (UTC epoch).
    Redoslijed:
      1) numerički 'startTimestamp' (skini ms ako treba)
      2) ISO 'startTimeUTC' ili 'startTime' -> pretvori u epoch
    """
    # Use the declared startTimestamp first — this is the scheduled/kickoff time
    # that you want to treat as the official match start.
    ts = to_int_or_none(ev_like.get("startTimestamp"))
    if ts is not None:
        if ts > 10**12:  # milisekunde -> sekunde
            ts = ts // 1000
        return ts

    for key in ("startTimeUTC", "startTime"):
        iso = ev_like.get(key)
        if isinstance(iso, str) and iso.strip():
            try:
                dt = datetime.fromisoformat(iso.strip().replace("Z", "+00:00"))
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                return int(dt.timestamp())
            except Exception:
                continue
    return None

def extract_scores(ev_like: dict) -> tuple[int | None, int | None]:
    """Vrati (home_current, away_current) kao int ili None."""
    hs = deep_get(ev_like, "homeScore", "current")
    aw = deep_get(ev_like, "awayScore", "current")
    return to_int_or_none(hs), to_int_or_none(aw)

def as_local_iso(ts_epoch: int | None) -> str | None:
    if ts_epoch is None:
        return None
    return datetime.fromtimestamp(ts_epoch, tz=timezone.utc).astimezone(LOCAL_TZ).isoformat()

def fetch_event_core(eid: int) -> dict:
    """
    Vrati dict s poljima:
      id, startTimestamp (sec), start_time_local (ISO), homeScore_current, awayScore_current
    """
    b = Browser()
    try:
        # Fetch the canonical event endpoint (explicit host) to avoid
        # differences between api.sofascore.com and www.sofascore.com or
        # snapshot query params.
        data = b.fetch_data(f"https://www.sofascore.com/api/v1/event/{eid}") or {}
        ev_obj = data.get("event") if isinstance(data, dict) and isinstance(data.get("event"), dict) else data
        if not isinstance(ev_obj, dict):
            raise RuntimeError("Event object missing")

        start_ts = parse_start_timestamp(ev_obj)
        home_c, away_c = extract_scores(ev_obj)

        # fallback na /summary za score ili start ts ako treba
        if home_c is None or away_c is None or start_ts is None:
            summ = b.fetch_data(f"https://www.sofascore.com/api/v1/event/{eid}/summary") or {}
            summ_obj = summ.get("summary") if isinstance(summ, dict) and isinstance(summ.get("summary"), dict) else summ
            if isinstance(summ_obj, dict):
                if home_c is None or away_c is None:
                    sc2 = extract_scores(summ_obj)
                    home_c = home_c if home_c is not None else sc2[0]
                    away_c = away_c if away_c is not None else sc2[1]
                if start_ts is None:
                    start_ts = parse_start_timestamp(summ_obj)

        return {
            "id": ev_obj.get("id"),
            "startTimestamp": start_ts,
            "start_time_local": as_local_iso(start_ts),
            "homeScore_current": home_c,
            "awayScore_current": away_c,
            "raw_keys": list(ev_obj.keys()) if isinstance(ev_obj, dict) else None,
        }
    finally:
        try:
            b.close()
        except Exception:
            pass

# --------- primjer korištenja ----------
if __name__ == "__main__":
    example_id = 14025088  # stavi bilo koji SofaScore event ID
    result = fetch_event_core(example_id)
    print(json.dumps(result, indent=2, ensure_ascii=False))
