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

      // New logic: find BIGGEST away win with goal difference > 3 (strict >3)
      // Priority: higher diff first, then most recent start_time.
      // Fallback: if none diff>3, show latest finished match (data[0]).
      const matches = data || [];
      let candidate = null;
      for (const m of matches) {
        const diff = (m.away_score || 0) - (m.home_score || 0);
        if (diff > 3) {
          if (!candidate) {
            candidate = { ...m, _diff: diff };
          } else if (diff > candidate._diff) {
            candidate = { ...m, _diff: diff };
          }
        }
      }
      // If multiple share same diff but earlier loop keeps earliest with that diff, refine by recency
      if (candidate) {
        // There could be another match later with same diff; re-filter to choose latest among max diff
        const maxDiff = candidate._diff;
        const bestSame = matches
          .filter(m => (m.away_score || 0) - (m.home_score || 0) === maxDiff)
          .sort((a,b) => new Date(b.start_time) - new Date(a.start_time))[0];
        candidate = { ...bestSame, _diff: maxDiff };
      }
      setUpset(candidate || matches[0] || null);
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
