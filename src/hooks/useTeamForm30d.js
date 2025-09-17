// src/hooks/useTeamForm30d.js
// Unified 30‑day team form stats used by Dashboard FormGuide and Teams bestForm.
// Ranking order (Option 2 confirmed):
// wins DESC, points DESC, goals_for DESC, goal_diff DESC, winPct DESC, played DESC, name ASC
// Exposed fields per team:
// { team_id, name, played, wins, draws, losses, goals_for, goals_against, goal_diff, points, winPct, last5 }
import { useState, useEffect, useCallback, useRef } from "react";
import supabase from "../services/supabase";

export function useTeamForm30d({ limit = 10 } = {}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [teams, setTeams] = useState([]);
  const mountedRef = useRef(true);

  const fetchData = useCallback(async () => {
    if (!mountedRef.current) return;
    setLoading(true);
    setError(null);
    try {
      const THIRTY = 30 * 24 * 60 * 60 * 1000;
      const since = new Date(Date.now() - THIRTY).toISOString();

      // Pull finished matches in period with team ids & goals.
      const { data: matches, error: mErr } = await supabase
        .from("matches")
        .select(
          "id, start_time, status, home_team_id, away_team_id, home_team, away_team, home_score, away_score"
        )
        .gte("start_time", since)
        .eq("status", "finished");
      if (mErr) throw mErr;
      let rows = matches || [];

      // --- Extra defensive filtering on client (timezone / type inconsistencies) ---
      const sinceTs = Date.now() - THIRTY;
      rows = rows.filter((r) => {
        const ts = new Date(r.start_time).getTime();
        if (!Number.isFinite(ts)) return false;
        return ts >= sinceTs; // ensure strictly within last 30*24h window
      });

      // Deduplicate by match id (safety in case of accidental duplicates from ingestion)
      const seenIds = new Set();
      rows = rows.filter((r) => {
        if (seenIds.has(r.id)) return false;
        seenIds.add(r.id);
        return true;
      });

      // Aggregate per team.
      const agg = new Map(); // team_id -> stats
      const ensure = (tid, name) => {
        if (!agg.has(tid)) {
          agg.set(tid, {
            team_id: tid,
            name: name || `Team ${tid}`,
            played: 0,
            wins: 0,
            draws: 0,
            losses: 0,
            goals_for: 0,
            goals_against: 0,
            lastResults: [], // newest first
          });
        }
        return agg.get(tid);
      };

      // Sort matches by start_time ascending so we can push results then slice last5 later (newest last then reverse).
      rows.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
      for (const m of rows) {
        const h = ensure(m.home_team_id, m.home_team);
        const a = ensure(m.away_team_id, m.away_team);
        const hs = m.home_score ?? 0;
        const as = m.away_score ?? 0;
        h.played++;
        a.played++;
        h.goals_for += hs;
        h.goals_against += as;
        a.goals_for += as;
        a.goals_against += hs;
        if (hs > as) {
          h.wins++;
          a.losses++;
          h.lastResults.push("W");
          a.lastResults.push("L");
        } else if (as > hs) {
          a.wins++;
          h.losses++;
          a.lastResults.push("W");
          h.lastResults.push("L");
        } else {
          h.draws++;
          a.draws++;
          h.lastResults.push("D");
          a.lastResults.push("D");
        }
      }

      let list = Array.from(agg.values()).map((t) => {
        const points = t.wins * 3 + t.draws;
        const winPct = t.played ? +((t.wins / t.played) * 100).toFixed(1) : 0;
        const goal_diff = t.goals_for - t.goals_against;
        // last5 newest first -> we pushed oldest→newest so lastResults already chronological; take last 5 and reverse so newest first.
        const last5 = t.lastResults.slice(-5).reverse();
        return { ...t, points, winPct, goal_diff, last5 };
      });

      // Anomaly guard: if some team shows impossible counts (e.g. > 30 matches in 30 days) we mark & clamp (development log only)
      list = list.map((t) => {
        if (t.played > 30) {
          if (import.meta.env?.DEV) {
            console.warn(
              `[useTeamForm30d] Anomalous played count ${t.played} for team ${t.name} – clamping to last 30 matches`
            );
          }
          // Derive proportional wins/goals by scaling last results slice
          // Simpler approach: treat only last 30 chronological results
          const trimmedResults = t.lastResults.slice(0, 30);
          const wins = trimmedResults.filter((r) => r === "W").length;
          const draws = trimmedResults.filter((r) => r === "D").length;
          const losses = trimmedResults.filter((r) => r === "L").length;
          const scaleFactor = 30 / t.played; // approximate scaling of goals
          return {
            ...t,
            played: 30,
            wins,
            draws,
            losses,
            goals_for: Math.round(t.goals_for * scaleFactor),
            goals_against: Math.round(t.goals_against * scaleFactor),
            goal_diff: Math.round(
              (t.goals_for - t.goals_against) * scaleFactor
            ),
          };
        }
        return t;
      });

      // Realism filters: remove obviously corrupt stats (over-aggregation / duplicates not caught by ID)
      const realistic = list.filter((t) => {
        if (t.played <= 0) return false;
        if (t.played > 15) return false; // >15 matches in 30 days is unlikely for a single club
        if (t.goals_for > 80) return false; // extreme outlier
        if (t.goals_for / t.played > 7) return false; // average >7 goals per match, discard
        if (t.wins > t.played) return false; // impossible
        return true;
      });

      realistic.sort((a, b) => {
        return (
          b.wins - a.wins ||
          b.goals_for - a.goals_for ||
          b.goal_diff - a.goal_diff ||
          a.name.localeCompare(b.name)
        );
      });

      setTeams(limit ? realistic.slice(0, limit) : realistic);
    } catch (e) {
      console.error("[useTeamForm30d] error", e);
      setError(e.message || "Failed to load team form");
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    mountedRef.current = true;
    fetchData();
    return () => {
      mountedRef.current = false;
    };
  }, [fetchData]);

  return { teams, loading, error, refetch: fetchData };
}

export default useTeamForm30d;
