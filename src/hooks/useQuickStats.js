// src/hooks/useQuickStats.js
import { useState, useEffect, useCallback, useRef } from "react";
import supabase from "../services/supabase";

export function useQuickStats() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({
    matchesToday: 0,
    avgGoals7d: 0,
    activePlayers7d: 0,
  });

  const mountedRef = useRef(true);

  const fetchStats = useCallback(async () => {
    if (!mountedRef.current) return;

    try {
      setLoading(true);
      setError(null);

      const now = new Date();
      const startOfDay = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
      );
      const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      // Parallel queries for better performance
      const [matchesTodayResult, weekMatchesResult, playerStatsResult] =
        await Promise.all([
          supabase
            .from("matches")
            .select("id", { count: "exact", head: true })
            .gte("start_time", startOfDay.toISOString())
            .lt("start_time", endOfDay.toISOString()),

          supabase
            .from("matches")
            .select("home_score,away_score")
            .gte("start_time", sevenDaysAgo.toISOString()),

          supabase
            .from("player_stats")
            .select("player_id")
            .gte("created_at", sevenDaysAgo.toISOString()),
        ]);

      if (!mountedRef.current) return;

      // Process results
      const matchesToday = matchesTodayResult.count || 0;

      const weekMatches = weekMatchesResult.data || [];
      const totalGoals = weekMatches.reduce(
        (sum, match) => sum + (match.home_score || 0) + (match.away_score || 0),
        0
      );
      const avgGoals = weekMatches.length ? totalGoals / weekMatches.length : 0;

      const uniquePlayers = new Set(
        (playerStatsResult.data || []).map((s) => s.player_id).filter(Boolean)
      );

      setStats({
        matchesToday,
        avgGoals7d: Number(avgGoals.toFixed(2)),
        activePlayers7d: uniquePlayers.size,
      });
    } catch (err) {
      if (!mountedRef.current) return;
      console.error("Error fetching quick stats:", err);
      setError(err.message || "Failed to load stats");
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchStats();

    return () => {
      mountedRef.current = false;
    };
  }, [fetchStats]);

  return { stats, loading, error, refetch: fetchStats };
}
