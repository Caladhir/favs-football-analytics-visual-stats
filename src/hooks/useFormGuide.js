// src/hooks/useFormGuide.js
import { useState, useEffect, useCallback, useRef } from "react";
import supabase from "../services/supabase";

export function useFormGuide() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState({
    total: 0,
    over25: 0,
    percentage: 0,
  });

  const mountedRef = useRef(true);

  const fetchFormGuide = useCallback(async () => {
    if (!mountedRef.current) return;

    try {
      setLoading(true);
      setError(null);

      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const { data, error: fetchError } = await supabase
        .from("matches")
        .select("home_score,away_score")
        .gte("start_time", sevenDaysAgo.toISOString())
        .eq("status", "finished");

      if (!mountedRef.current) return;

      if (fetchError) throw fetchError;

      const matches = data || [];
      const over25 = matches.filter(
        (match) => (match.home_score || 0) + (match.away_score || 0) > 2
      ).length;

      const percentage = matches.length
        ? ((over25 / matches.length) * 100).toFixed(1)
        : 0;

      setSummary({
        total: matches.length,
        over25,
        percentage: Number(percentage),
      });
    } catch (err) {
      if (!mountedRef.current) return;
      console.error("Error fetching form guide:", err);
      setError(err.message || "Failed to load form guide");
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchFormGuide();

    return () => {
      mountedRef.current = false;
    };
  }, [fetchFormGuide]);

  return { summary, loading, error, refetch: fetchFormGuide };
}
