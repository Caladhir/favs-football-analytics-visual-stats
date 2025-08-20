// src/hooks/useActivityHeatmap.js
import { useState, useEffect, useCallback, useRef } from "react";
import supabase from "../services/supabase";

export function useActivityHeatmap(daysBack = 7) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hourlyData, setHourlyData] = useState(Array(24).fill(0));
  const [totalMatches, setTotalMatches] = useState(0);

  const mountedRef = useRef(true);

  const fetchActivity = useCallback(async () => {
    if (!mountedRef.current) return;

    try {
      setLoading(true);
      setError(null);

      const daysAgo = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

      const { data, error: fetchError } = await supabase
        .from("matches")
        .select("start_time")
        .gte("start_time", daysAgo.toISOString());

      if (!mountedRef.current) return;

      if (fetchError) throw fetchError;

      const hourCounts = Array(24).fill(0);
      (data || []).forEach((match) => {
        const hour = new Date(match.start_time).getUTCHours();
        hourCounts[hour]++;
      });

      setHourlyData(hourCounts);
      setTotalMatches(data?.length || 0);
    } catch (err) {
      if (!mountedRef.current) return;
      console.error("Error fetching activity heatmap:", err);
      setError(err.message || "Failed to load activity data");
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [daysBack]);

  useEffect(() => {
    mountedRef.current = true;
    fetchActivity();

    return () => {
      mountedRef.current = false;
    };
  }, [fetchActivity]);

  return { hourlyData, totalMatches, loading, error, refetch: fetchActivity };
}
