// src/hooks/useTopScorers.js - FIXED VERSION
import { useState, useEffect, useCallback, useRef } from "react";
import supabase from "../services/supabase";

export function useTopScorers(limit = 5) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [scorers, setScorers] = useState([]);

  const mountedRef = useRef(true);

  const fetchTopScorers = useCallback(async () => {
    if (!mountedRef.current) return;

    try {
      setLoading(true);
      setError(null);

      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      // ✅ FIXED: Get player stats from last 7 days with separate queries
      const { data: stats, error: statsError } = await supabase
        .from("player_stats")
        .select("player_id,goals")
        .gte("created_at", sevenDaysAgo.toISOString());

      if (!mountedRef.current) return;

      if (statsError) {
        console.error("Stats error:", statsError);
        throw new Error(`Failed to fetch player stats: ${statsError.message}`);
      }

      // Group by player and sum goals
      const goalsByPlayer = new Map();
      (stats || []).forEach((stat) => {
        if (stat.player_id && stat.goals) {
          goalsByPlayer.set(
            stat.player_id,
            (goalsByPlayer.get(stat.player_id) || 0) + stat.goals
          );
        }
      });

      // Get top players
      const topPlayerIds = [...goalsByPlayer.entries()]
        .sort((a, b) => b[1] - a[1])
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

      const scorersData = topPlayerIds.map((id, index) => ({
        rank: index + 1,
        id,
        name: (players || []).find((p) => p.id === id)?.full_name || "Unknown",
        goals: goalsByPlayer.get(id) || 0,
      }));

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
  }, [limit]);

  useEffect(() => {
    mountedRef.current = true;
    fetchTopScorers();

    return () => {
      mountedRef.current = false;
    };
  }, [fetchTopScorers]);

  return { scorers, loading, error, refetch: fetchTopScorers };
}
