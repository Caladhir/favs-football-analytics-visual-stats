// src/hooks/useFormGuide.js
import { useState, useEffect, useCallback, useRef } from "react";
import supabase from "../services/supabase";

// Returns top teams by number of wins (and win % as tie breaker) over the last 30 days.
// Output shape:
// summary = {
//    periodDays: 30,
//    generatedAt: ISOString,
//    teams: [
//       { team_id, name, wins, played, winPct }
//    ]
// }
export function useFormGuide({ limit = 5 } = {}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState({ periodDays: 30, generatedAt: null, teams: [] });
  const mountedRef = useRef(true);

  const fetchFormGuide = useCallback(async () => {
    if (!mountedRef.current) return;
    try {
      setLoading(true);
      setError(null);

      const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
      const since = new Date(Date.now() - THIRTY_DAYS).toISOString();

      // Fetch finished matches in the last 30 days with minimal fields.
      const { data: matches, error: matchesError } = await supabase
        .from("matches")
        .select("id, start_time, home_team_id, away_team_id, home_score, away_score")
        .gte("start_time", since)
        .eq("status", "finished");

      if (matchesError) throw matchesError;

      const safeMatches = matches || [];

      // Aggregate wins & played counts.
      const teamStats = new Map(); // team_id -> { wins, played }

      for (const m of safeMatches) {
        const homeId = m.home_team_id;
        const awayId = m.away_team_id;
        if (!teamStats.has(homeId)) teamStats.set(homeId, { wins: 0, played: 0 });
        if (!teamStats.has(awayId)) teamStats.set(awayId, { wins: 0, played: 0 });

        teamStats.get(homeId).played += 1;
        teamStats.get(awayId).played += 1;

        const hs = m.home_score ?? 0;
        const as = m.away_score ?? 0;
        if (hs > as) {
          teamStats.get(homeId).wins += 1;
        } else if (as > hs) {
          teamStats.get(awayId).wins += 1;
        }
        // Draws: no increment to wins
      }

      if (teamStats.size === 0) {
        setSummary({ periodDays: 30, generatedAt: new Date().toISOString(), teams: [] });
        return;
      }

      // Prepare list for ranking (compute winPct early for sorting) and filter invalid IDs (null/undefined).
      const allTeamsStats = Array.from(teamStats.entries())
        .filter(([team_id]) => team_id !== null && team_id !== undefined)
        .map(([team_id, s]) => ({
          team_id,
          wins: s.wins,
          played: s.played,
          winPct: s.played ? +((s.wins / s.played) * 100).toFixed(1) : 0,
        }));

      // Sort: wins desc, winPct desc, played desc, team_id lexicographically for stability (handles UUIDs/strings).
      allTeamsStats.sort((a, b) => {
        return (
          b.wins - a.wins ||
          b.winPct - a.winPct ||
          b.played - a.played ||
          String(a.team_id).localeCompare(String(b.team_id))
        );
      });

      const top = allTeamsStats.slice(0, limit);
      const topIds = top.map(t => t.team_id).filter(id => id !== null && id !== undefined);

      let nameMap = new Map();
      if (topIds.length > 0) {
        const { data: teamsData, error: teamsError } = await supabase
          .from("teams")
          .select("id,name")
          .in("id", topIds);
        if (teamsError) throw teamsError;
        nameMap = new Map((teamsData || []).map(t => [t.id, t.name]));
      }

      const enriched = top.map(t => ({
        ...t,
        name: nameMap.get(t.team_id) || `Team ${t.team_id}`,
      }));

      setSummary({
        periodDays: 30,
        generatedAt: new Date().toISOString(),
        teams: enriched,
      });
    } catch (err) {
      if (!mountedRef.current) return;
      console.error("Error fetching form guide (wins):", err);
      setError(err.message || "Failed to load form guide");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    mountedRef.current = true;
    fetchFormGuide();
    return () => {
      mountedRef.current = false;
    };
  }, [fetchFormGuide]);

  return { summary, loading, error, refetch: fetchFormGuide };
}
