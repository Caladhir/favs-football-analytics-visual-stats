// src/hooks/useBestWorstPerformers.js
import { useState, useEffect, useCallback, useRef } from "react";
import supabase from "../services/supabase";

export function useBestWorstPerformers(daysBack = 7, limit = 3) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [performers, setPerformers] = useState({ best: [], worst: [] });

  const mountedRef = useRef(true);

  const fetchPerformers = useCallback(async () => {
    if (!mountedRef.current) return;

    try {
      setLoading(true);
      setError(null);

      const daysAgo = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

      const { data, error: fetchError } = await supabase
        .from("matches")
        .select("home_team,away_team,home_score,away_score,status")
        .gte("start_time", daysAgo.toISOString())
        .eq("status", "finished");

      if (!mountedRef.current) return;

      if (fetchError) throw fetchError;

      const teamGoals = new Map();
      (data || []).forEach((match) => {
        const addGoals = (team, goals) => {
          teamGoals.set(team, (teamGoals.get(team) || 0) + goals);
        };

        addGoals(match.home_team, match.home_score || 0);
        addGoals(match.away_team, match.away_score || 0);
      });

      const sorted = [...teamGoals.entries()].sort((a, b) => b[1] - a[1]);

      setPerformers({
        best: sorted
          .slice(0, limit)
          .map(([team, goals]) => ({ team, goals, display: `+${goals}` })),
        worst: sorted
          .slice(-limit)
          .reverse()
          .map(([team, goals]) => ({ team, goals, display: `${goals}` })),
      });
    } catch (err) {
      if (!mountedRef.current) return;
      console.error("Error fetching performers:", err);
      setError(err.message || "Failed to load performers");
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [daysBack, limit]);

  useEffect(() => {
    mountedRef.current = true;
    fetchPerformers();

    return () => {
      mountedRef.current = false;
    };
  }, [fetchPerformers]);

  return { performers, loading, error, refetch: fetchPerformers };
}
