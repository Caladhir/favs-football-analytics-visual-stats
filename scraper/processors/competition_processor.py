# scraper/processors/competition_processor.py
from __future__ import annotations
from typing import Any, Dict, List, Optional

class CompetitionProcessor:
    """Vadi turnir/ligu iz eventa."""
    def parse(self, event: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        t = event.get("tournament") or event.get("competition") or {}
        if not isinstance(t, dict):
            return None
        # SofaScore event payload normally: tournament.id (season-specific), tournament.uniqueTournament.id (stable competition)
        tid_season = t.get("id")
        ut = t.get("uniqueTournament") if isinstance(t.get("uniqueTournament"), dict) else {}
        tid_unique = ut.get("id") if isinstance(ut, dict) else None
        # Prefer unique tournament ID for logo + primary key; fallback to season id
        tid_primary = tid_unique or tid_season
        if not tid_primary:
            return None
        name = t.get("name") or (ut.get("name") if isinstance(ut, dict) else "") or ""
        # Derive logo URL using unique tournament id when available
        logo_id = tid_unique or tid_season
        logo_url = f"https://img.sofascore.com/api/v1/unique-tournament/{logo_id}/image/dark" if logo_id else None
        # Optional priority / order fields (if exposed). Some payloads provide a nested category or priority.
        priority = None
        try:
            priority = t.get("priority") or t.get("order") or (t.get("category") or {}).get("priority")
        except Exception:
            priority = None
        # Country enrichment (regression vs. legacy) – derive from category/name fields if available
        country = None
        try:
            cat = t.get("category") or {}
            # Sofascore category name is typically country/region (e.g. "England")
            country = cat.get("name") or cat.get("countryName") or cat.get("alpha2")
        except Exception:
            country = None
        out = {"sofascore_id": int(tid_primary), "name": name}
        if tid_season and tid_unique and tid_season != tid_unique:
            out["season_tournament_id"] = int(tid_season)
            out["unique_tournament_id"] = int(tid_unique)
        if logo_url:
            out["logo_url"] = logo_url
        if priority is not None:
            out["priority"] = priority
        if country:
            out["country"] = country
        return out

competition_processor = CompetitionProcessor()
