from __future__ import annotations
from typing import Dict, Any, List, Tuple

def build_subs_index(enriched_events: List[Dict[str, Any]]) -> Dict[Tuple[int,int], Dict[str,int]]:
    """Create (event_id, player_sofa_id) -> {in_minute?, out_minute?} index.

    Safe to call for both initial dump and incremental fetch loop.
    """
    subs: Dict[Tuple[int,int], Dict[str,int]] = {}
    for enr in enriched_events:
        ev_id = enr.get("event_id") or (enr.get("event") or {}).get("id")
        try:
            ev_id = int(ev_id)
        except Exception:
            ev_id = None
        if not ev_id:
            continue
        incidents = enr.get("events") or []
        for inc in incidents:
            try:
                rtype = str(inc.get("type") or "").lower()
                if "substitution" not in rtype:
                    continue
                minute = None
                for k in ("minute","minutes"):
                    if inc.get(k) is not None:
                        try:
                            minute = int(inc.get(k)); break
                        except Exception:
                            pass
                if minute is None and isinstance(inc.get("time"), dict):
                    t = inc.get("time")
                    if t.get("minute") is not None:
                        try: minute = int(t.get("minute"))
                        except Exception: minute = None
                    if minute is not None and t.get("addMinutes") not in (None, ""):
                        try: minute += int(t.get("addMinutes"))
                        except Exception: pass
                if minute is None:
                    minute = 0
                pin = inc.get("playerIn") or inc.get("player_in") or inc.get("playerInPlayer") or inc.get("player")
                pout = inc.get("playerOut") or inc.get("player_out") or inc.get("playerOutPlayer") or inc.get("relatedPlayer")
                in_id = pin.get("id") if isinstance(pin, dict) else None
                out_id = pout.get("id") if isinstance(pout, dict) else None
                if in_id:
                    key = (ev_id, int(in_id))
                    subs.setdefault(key, {})
                    subs[key].setdefault("in_minute", minute)
                if out_id:
                    key2 = (ev_id, int(out_id))
                    subs.setdefault(key2, {})
                    subs[key2].setdefault("out_minute", minute)
            except Exception:
                continue
    return subs

subs_minutes_processor = build_subs_index