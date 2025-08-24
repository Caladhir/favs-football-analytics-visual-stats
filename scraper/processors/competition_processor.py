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
        # Derive logo URL (SofaScore pattern) if ID present
        logo_url = f"https://img.sofascore.com/api/v1/unique-tournament/{tid}/image/dark" if tid else None
        # Optional priority / order fields (if exposed). Some payloads provide a nested category or priority.
        priority = None
        try:
            priority = t.get("priority") or t.get("order") or (t.get("category") or {}).get("priority")
        except Exception:
            priority = None
        out = {"sofascore_id": int(tid), "name": name}
        if logo_url:
            out["logo_url"] = logo_url
        if priority is not None:
            out["priority"] = priority
        return out

competition_processor = CompetitionProcessor()
