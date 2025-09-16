// src/hooks/useTopScorers.js - FIXED VERSION
import { useState, useEffect, useCallback, useRef } from "react";
import supabase from "../services/supabase";

// period: '7d' | '30d' | 'season'
export function useTopScorers(limit = 5, period = "30d") {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [scorers, setScorers] = useState([]);

  const mountedRef = useRef(true);

  const fetchTopScorers = useCallback(async () => {
    if (!mountedRef.current) return;

    try {
      setLoading(true);
      setError(null);

      // Determine time boundary based on period
      let boundaryDate;
      if (period === "7d") {
        boundaryDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      } else if (period === "30d") {
        boundaryDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      } else if (period === "season") {
        // Simple heuristic: start of current (UTC) season assumed July 1st of current or previous year
        const now = new Date();
        const year =
          now.getUTCMonth() >= 6
            ? now.getUTCFullYear()
            : now.getUTCFullYear() - 1; // if after June use current year, else previous
        boundaryDate = new Date(Date.UTC(year, 6, 1, 0, 0, 0));
      } else {
        boundaryDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // fallback 30d
      }

      // ✅ FIXED: Get player stats from last 7 days with separate queries
      const { data: stats, error: statsError } = await supabase
        .from("player_stats")
        .select("player_id,goals,assists")
        .gte("created_at", boundaryDate.toISOString());

      if (!mountedRef.current) return;

      if (statsError) {
        console.error("Stats error:", statsError);
        throw new Error(`Failed to fetch player stats: ${statsError.message}`);
      }

      // Group by player and sum goals + assists
      const aggregate = new Map();
      (stats || []).forEach((stat) => {
        if (!stat.player_id) return;
        const prev = aggregate.get(stat.player_id) || { goals: 0, assists: 0 };
        prev.goals += stat.goals || 0;
        prev.assists += stat.assists || 0;
        aggregate.set(stat.player_id, prev);
      });

      // Determine ranking (primary: goals, secondary: assists)
      const topPlayerIds = [...aggregate.entries()]
        .sort((a, b) => {
          const ga = a[1];
          const gb = b[1];
          if (gb.goals !== ga.goals) return gb.goals - ga.goals;
          if (gb.assists !== ga.assists) return gb.assists - ga.assists;
          return 0;
        })
        .slice(0, limit)
        .map(([playerId]) => playerId);

      if (topPlayerIds.length === 0) {
        setScorers([]);
        return;
      }

      // ✅ FIXED: Get player names with separate query
      const { data: players, error: playersError } = await supabase
        .from("players")
        .select("id,full_name")
        .in("id", topPlayerIds);

      if (!mountedRef.current) return;

      if (playersError) {
        console.error("Players error:", playersError);
        throw new Error(`Failed to fetch players: ${playersError.message}`);
      }

      const scorersData = topPlayerIds.map((id, index) => {
        const agg = aggregate.get(id) || { goals: 0, assists: 0 };
        return {
          rank: index + 1,
          id,
          name:
            (players || []).find((p) => p.id === id)?.full_name || "Unknown",
          goals: agg.goals,
          assists: agg.assists,
        };
      });

      setScorers(scorersData);
    } catch (err) {
      if (!mountedRef.current) return;
      console.error("Error fetching top scorers:", err);
      setError(err.message || "Failed to load top scorers");
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [limit, period]);

  useEffect(() => {
    mountedRef.current = true;
    fetchTopScorers();

    return () => {
      mountedRef.current = false;
    };
  }, [fetchTopScorers]);

  return { scorers, loading, error, refetch: fetchTopScorers };
}
