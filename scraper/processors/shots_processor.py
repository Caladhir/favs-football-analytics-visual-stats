from __future__ import annotations
from typing import Any, Dict, List, Optional

class ShotsProcessor:
    """Parse SofaScore shotmap payload into DB-ready shot rows.

    Outcome normalisation is left to the DB layer (upsert_shots). We focus on
    extracting identifiers and coordinates robustly.
    """

    def parse(self, raw: Any, event_id: int) -> List[Dict[str, Any]]:
        if raw is None:
            return []
        items = []
        if isinstance(raw, list):
            items = raw
        elif isinstance(raw, dict):
            items = raw.get("shotmap") or raw.get("shots") or []
        out: List[Dict[str, Any]] = []
        for s in items:
            if not isinstance(s, dict):
                continue
            player_obj = s.get("player") or {}
            pid = player_obj.get("id") or s.get("playerId")
            if not pid:
                continue
            try:
                pid = int(pid)
            except Exception:
                continue
            # assist
            assist_id: Optional[int] = None
            try:
                assist_id = (s.get("assist") or {}).get("id")
                if assist_id is not None:
                    assist_id = int(assist_id)
            except Exception:
                assist_id = None
            minute = s.get("time") or s.get("minute")
            # 'second' column removed from DB; ignore any sub-minute precision fields
            try:
                if minute is not None:
                    minute = int(minute)
            except Exception:
                minute = None
            # we no longer store per-second precision
            x = s.get("x") or (s.get("playerCoordinates") or {}).get("x") or (s.get("draw") or {}).get("x")
            y = s.get("y") or (s.get("playerCoordinates") or {}).get("y") or (s.get("draw") or {}).get("y")
            try:
                if x is not None:
                    x = float(x)
                if y is not None:
                    y = float(y)
            except Exception:
                x = y = None
            outcome_raw = s.get("shotType") or s.get("shotResult") or s.get("incidentType") or s.get("result") or s.get("outcome")
            if isinstance(outcome_raw, str):
                outcome_norm = outcome_raw.strip().lower().replace(" ", "_")
            else:
                outcome_norm = None
            # Normalisation map (keep semantic families)
            omap = {
                "goal": "goal", "g": "goal", "shot_on_goal": "goal", "penalty_goal": "goal",
                "own_goal": "own_goal",
                "saved": "saved", "save": "saved", "keeper_save": "saved",
                "blocked": "blocked", "block": "blocked",
                "off_target": "off_target", "miss": "off_target", "missed": "off_target", "wide": "off_target",
                "woodwork": "woodwork", "post": "woodwork", "crossbar": "woodwork", "bar": "woodwork",
                "penalty_miss": "off_target", "pen_miss": "off_target",
            }
            outcome = omap.get(outcome_norm, outcome_norm or "unknown")
            # Side/team detection: prefer explicit team key, else isHome boolean, else nested team.id
            side = s.get("team")  # expected to be 'home' or 'away'
            if side not in ("home","away"):
                if isinstance(s.get("isHome"), bool):
                    side = "home" if s.get("isHome") else "away"
                else:
                    team_obj = s.get("team") or player_obj.get("team") or {}
                    try:
                        # some payloads encode the team id numerically; we defer mapping to later
                        team_id_ref = team_obj.get("id")
                    except Exception:
                        team_id_ref = None
                    side = side if side in ("home","away") else None
            row = {
                "source": "sofascore",
                "source_event_id": int(event_id),
                "player_sofascore_id": pid,
                "assist_player_sofascore_id": assist_id,
                "minute": minute,
                "x": x,
                "y": y,
                "xg": s.get("xg") or s.get("expectedGoals") or s.get("xG"),
                "body_part": (s.get("bodyPart") or "").lower() if isinstance(s.get("bodyPart"), str) else None,
                "situation": (s.get("situation") or "").lower() if isinstance(s.get("situation"), str) else None,
                "is_penalty": bool(s.get("isPenalty") or (isinstance(outcome, str) and outcome.startswith("pen_"))) or None,
                "is_own_goal": bool(s.get("isOwnGoal") or outcome == "own_goal") or None,
                "outcome": outcome,
                "team": side,
                # Preserve raw isHome if present for fallback mapping in legacy transform
                "isHome": s.get("isHome") if isinstance(s.get("isHome"), bool) else None,
            }
            out.append(row)
        return out

shots_processor = ShotsProcessor()
