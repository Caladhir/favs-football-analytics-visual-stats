from __future__ import annotations
from typing import Any, Dict, List

class AveragePositionsProcessor:
    """Parse /average-positions payload into rows for average_positions table."""

    def parse(self, raw: Any, event_id: int) -> List[Dict[str, Any]]:
        if not isinstance(raw, dict):
            return []
        out: List[Dict[str, Any]] = []
        for side in ("home", "away"):
            for it in raw.get(side) or []:
                if not isinstance(it, dict):
                    continue
                pl = it.get("player") or {}
                pid = pl.get("id") or it.get("playerId")
                if not pid:
                    continue
                try:
                    pid = int(pid)
                except Exception:
                    continue
                ax = it.get("averageX") or it.get("avgX") or it.get("x")
                ay = it.get("averageY") or it.get("avgY") or it.get("y")
                if ax is None or ay is None:
                    continue
                try:
                    ax = float(ax); ay = float(ay)
                except Exception:
                    continue
                out.append({
                    "source": "sofascore",
                    "source_event_id": int(event_id),
                    "player_sofascore_id": pid,
                    "avg_x": ax,
                    "avg_y": ay,
                })
        return out

avg_positions_processor = AveragePositionsProcessor()
