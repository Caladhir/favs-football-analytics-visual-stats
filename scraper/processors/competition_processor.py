# scraper/processors/competition_processor.py
from __future__ import annotations
from typing import Any, Dict, List, Optional

class CompetitionProcessor:
    """Vadi turnir/ligu iz eventa."""
    def parse(self, event: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        t = event.get("tournament") or event.get("competition") or {}
        if not isinstance(t, dict):
            return None
        tid = t.get("id")
        if not tid:
            return None
        name = t.get("name") or ""
        return {"sofascore_id": int(tid), "name": name}

competition_processor = CompetitionProcessor()
