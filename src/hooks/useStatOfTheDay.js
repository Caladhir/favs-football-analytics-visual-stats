// src/hooks/useStatOfTheDay.js
import { useState, useEffect, useCallback, useRef } from "react";
import supabase from "../services/supabase";

export function useStatOfTheDay() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stat, setStat] = useState(null);

  const mountedRef = useRef(true);

  const fetchStat = useCallback(async () => {
    if (!mountedRef.current) return;

    try {
      setLoading(true);
      setError(null);

      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const { data, error: fetchError } = await supabase
        .from("matches")
        .select("home_team,away_team,home_score,away_score,start_time")
        .gte("start_time", sevenDaysAgo.toISOString())
        .eq("status", "finished")
        .order("start_time", { ascending: false })
        .limit(200);

      if (!mountedRef.current) return;

      if (fetchError) throw fetchError;

      let bestMatch = null;
      (data || []).forEach((match) => {
        const totalGoals = (match.home_score || 0) + (match.away_score || 0);
        if (!bestMatch || totalGoals > bestMatch.goals) {
          bestMatch = {
            teams: `${match.home_team} vs ${match.away_team}`,
            goals: totalGoals,
            date: match.start_time,
          };
        }
      });

      setStat(bestMatch);
    } catch (err) {
      if (!mountedRef.current) return;
      console.error("Error fetching stat of the day:", err);
      setError(err.message || "Failed to load stat");
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchStat();

    return () => {
      mountedRef.current = false;
    };
  }, [fetchStat]);

  return { stat, loading, error, refetch: fetchStat };
}
