// src/hooks/useXgVsGoals.js
import { useState, useEffect, useCallback, useRef } from "react";
import supabase from "../services/supabase";

export function useXgVsGoals(daysBack = 21, limit = 4) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [teams, setTeams] = useState([]);

  const mountedRef = useRef(true);

  const fetchXgData = useCallback(async () => {
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

      // Calculate team stats
      const teamStats = new Map();
      (data || []).forEach((match) => {
        const updateTeamStats = (team, goals) => {
          const current = teamStats.get(team) || { goals: 0, games: 0 };
          teamStats.set(team, {
            goals: current.goals + goals,
            games: current.games + 1,
          });
        };

        updateTeamStats(match.home_team, match.home_score || 0);
        updateTeamStats(match.away_team, match.away_score || 0);
      });

      // Get top scoring teams and calculate xG proxy
      const topTeams = [...teamStats.entries()]
        .sort((a, b) => b[1].goals - a[1].goals)
        .slice(0, limit)
        .map(([team, stats]) => {
          const avgGoals = stats.goals / stats.games;
          return {
            team,
            actual: avgGoals,
            expected: avgGoals * 0.9, // Simple proxy (90% of actual)
            games: stats.games,
            totalGoals: stats.goals,
          };
        });

      setTeams(topTeams);
    } catch (err) {
      if (!mountedRef.current) return;
      console.error("Error fetching xG data:", err);
      setError(err.message || "Failed to load xG data");
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [daysBack, limit]);

  useEffect(() => {
    mountedRef.current = true;
    fetchXgData();

    return () => {
      mountedRef.current = false;
    };
  }, [fetchXgData]);

  return { teams, loading, error, refetch: fetchXgData };
}
