// src/hooks/useUpsetAlert.js
import { useState, useEffect, useCallback, useRef } from "react";
import supabase from "../services/supabase";

export function useUpsetAlert() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [upset, setUpset] = useState(null);

  const mountedRef = useRef(true);

  const fetchUpset = useCallback(async () => {
    if (!mountedRef.current) return;

    try {
      setLoading(true);
      setError(null);

      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const { data, error: fetchError } = await supabase
        .from("matches")
        .select(
          "home_team,away_team,home_score,away_score,competition,start_time"
        )
        .eq("status", "finished")
        .gte("start_time", sevenDaysAgo.toISOString())
        .order("start_time", { ascending: false })
        .limit(300);

      if (!mountedRef.current) return;

      if (fetchError) throw fetchError;

      // Find upset: away team wins by 2+ goals
      const upsetMatch = (data || []).find(
        (match) => (match.away_score || 0) - (match.home_score || 0) >= 2
      );

      setUpset(upsetMatch || (data && data[0]) || null);
    } catch (err) {
      if (!mountedRef.current) return;
      console.error("Error fetching upset alert:", err);
      setError(err.message || "Failed to load upset data");
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchUpset();

    return () => {
      mountedRef.current = false;
    };
  }, [fetchUpset]);

  return { upset, loading, error, refetch: fetchUpset };
}
