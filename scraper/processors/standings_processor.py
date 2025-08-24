from __future__ import annotations
from typing import Any, Dict, List, Optional
from utils.logger import get_logger

logger = get_logger(__name__)

class StandingsProcessor:
    """
    Normalizira SofaScore standings u DB shemu:
    competition_id, season, team_id, rank, played, wins, draws, losses,
    goals_for, goals_against, points, form
    (ovo je "wire-format" – bez UUID-ova; mappanje u UUID-ove radi database sloj)
    """

    def __init__(self) -> None:
        pass

    @staticmethod
    def _get_first(items: List[Dict[str, Any]], *keys: str) -> Optional[Any]:
        for k in keys:
            if k in items:
                return items[k]
        return None

    def parse(self, raw: Dict[str, Any], comp_sofa_id: int, season_str: str) -> List[Dict[str, Any]]:
        """
        `raw` je payload s jedne od /standings ruta.
        Pokušavamo pronaći listu redaka u više tipičnih polja.
        """
        table_blocks: List[Any] = []
        # Sofascore vraća razne strukture; pokrij više varijanti
        candidates = [
            raw.get("standings"),
            raw.get("overallStandings"),
            raw.get("tables"),
            raw.get("allStandings"),
            raw.get("rows"),
            raw.get("data"),
            raw.get("standingsData"),
        ]
        for c in candidates:
            if isinstance(c, list) and c:
                table_blocks = c
                break
            if isinstance(c, dict) and c.get("rows"):
                table_blocks = c.get("rows")
                break

        # unutar bloka zna biti još "rows"
        if table_blocks and isinstance(table_blocks[0], dict) and "rows" in table_blocks[0]:
            # Preferiraj blok tipa 'total' ako postoji, inače uzmi onaj s najviše redova
            block = None
            try:
                block = next((b for b in table_blocks if (b.get("type") or b.get("name")) == "total"), None)
            except Exception:
                block = None
            if not block:
                block = max(table_blocks, key=lambda x: len(x.get("rows") or []))
            table_rows = block.get("rows") or []
        else:
            table_rows = table_blocks

        out: List[Dict[str, Any]] = []
        for r in table_rows or []:
            # prepoznaj polja kroz tipične ključeve
            team = r.get("team") or r.get("participant") or r.get("competitor") or {}
            stats = r.get("stats") or r

            team_sofa = team.get("id") or team.get("teamId") or team.get("sofaId")
            if not team_sofa:
                # ponekad je team kao int
                if isinstance(team, int):
                    team_sofa = team
                else:
                    continue

            rank    = r.get("position") or r.get("rank") or stats.get("position")
            played  = stats.get("matches") or stats.get("played") or (
                (stats.get("wins") is not None and stats.get("draws") is not None and stats.get("losses") is not None) and (stats.get("wins")+stats.get("draws")+stats.get("losses"))
            )
            wins    = stats.get("wins") or stats.get("w")
            draws   = stats.get("draws") or stats.get("d")
            losses  = stats.get("losses") or stats.get("l")
            # Goals for / against (wider key coverage: scoresFor/scoresAgainst)
            gf      = (stats.get("goalsFor") or stats.get("gf") or stats.get("scored") or stats.get("scoresFor"))
            ga      = (stats.get("goalsAgainst") or stats.get("ga") or stats.get("conceded") or stats.get("scoresAgainst"))
            points  = stats.get("points") or stats.get("pts")
            form    = r.get("form") or stats.get("form")

            # Normalise numeric types early
            rank   = self._as_int(rank)
            played = self._as_int(played)
            wins   = self._as_int(wins)
            draws  = self._as_int(draws)
            losses = self._as_int(losses)
            gf     = self._as_int(gf)
            ga     = self._as_int(ga)
            points = self._as_int(points)

            # Treat missing basic counts as 0 placeholders (some feeds omit zeros)
            # Defer points until after reconstruction
            zero_if_missing = played is not None
            if zero_if_missing:
                if wins is None: wins = 0
                if draws is None: draws = 0
                if losses is None: losses = 0
                if gf is None: gf = 0
                if ga is None: ga = 0

            # --- Reconstruction logic ---
            # Use equations:
            # 1) wins + draws + losses = played
            # 2) 3*wins + draws = points
            # Derive missing fields where possible.
            if played is not None:
                # Derive using points when available
                if points is not None:
                    if wins is not None and draws is None:
                        cand = points - 3*wins
                        if cand >= 0:
                            draws = cand
                    if wins is None and draws is not None:
                        # wins = (points - draws)/3 if divisible
                        diff = points - draws
                        if diff >= 0 and diff % 3 == 0:
                            wins = diff // 3
                    if wins is None and draws is None and losses is not None:
                        # From equations: wins = (points - (played - losses)) / 2
                        diff = points - (played - losses)
                        if diff >= 0 and diff % 2 == 0:
                            wins = diff // 2
                            draws = played - losses - wins
                    if wins is not None and draws is not None and points is None:
                        points = wins*3 + draws
                # Use played total to backfill single missing component
                known = [x is not None for x in (wins, draws, losses)].count(True)
                if known >= 2:
                    if wins is None:
                        wins = played - (draws or 0) - (losses or 0)
                    if draws is None:
                        draws = played - (wins or 0) - (losses or 0)
                    if losses is None:
                        losses = played - (wins or 0) - (draws or 0)
            # Final guard: ensure non-negative and realistic
            for name, val in ("wins", wins), ("draws", draws), ("losses", losses):
                if val is not None and val < 0:
                    if name == "wins": wins = 0
                    if name == "draws": draws = 0
                    if name == "losses": losses = 0
            if points is None and wins is not None and draws is not None and wins >= 0 and draws >= 0:
                points = wins*3 + draws
            if points is None and zero_if_missing:
                points = 0

            out.append({
                "competition_sofascore_id": int(comp_sofa_id),
                "season": season_str,
                "team_sofascore_id": int(team_sofa),
                "rank": rank,
                "played": played,
                "wins": wins,
                "draws": draws,
                "losses": losses,
                "goals_for": gf,
                "goals_against": ga,
                "points": points,
                "form": self._stringify_form(form),
            })

        logger.info(f"[standings] parsed rows={len(out)}")
        return out

    @staticmethod
    def _as_int(v) -> int | None:
        try:
            if v is None: return None
            if isinstance(v, str):
                s = v.strip().replace(",", ".")
                if not s: return None
                return int(float(s))
            return int(v)
        except Exception:
            return None

    @staticmethod
    def _stringify_form(v) -> str | None:
        if v is None:
            return None
        # često je lista "WDLWD" ili detaljni objekti
        if isinstance(v, list):
            # probaj izvuć 'result' ili 'outcome' polja
            chars = []
            for item in v:
                res = (isinstance(item, dict) and (item.get("result") or item.get("outcome") or item.get("letter")))
                if res:
                    chars.append(str(res)[0].upper())
            if chars:
                return "".join(chars)[:10]
            return "".join([str(x)[0].upper() for x in v])[:10]
        if isinstance(v, dict):
            return v.get("summary") or v.get("form") or None
        return str(v)[:32]
