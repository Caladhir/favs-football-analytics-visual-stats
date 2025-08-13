// src/hooks/useLiveMatches.js
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import supabase from "../services/supabase";

const INTERVALS = {
  ultra: 2000, // >50 live
  fast: 5000, // 15–50 live
  normal: 10000, // 1–14 live
  idle: 20000, // 0 live
};

export function useLiveMatches() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [backgroundRefreshing, setBackgroundRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [isRealtimeActive, setIsRealtimeActive] = useState(false);

  const mountedRef = useRef(true);
  const timerRef = useRef(null);
  const lastRealtimeAtRef = useRef(0);

  const liveCount = useMemo(() => matches.length, [matches]);

  const pickInterval = (count) => {
    if (count > 50) return INTERVALS.ultra;
    if (count >= 15) return INTERVALS.fast;
    if (count >= 1) return INTERVALS.normal;
    return INTERVALS.idle;
  };

  const fetchOnce = useCallback(async (foreground = false) => {
    if (!mountedRef.current) return;

    foreground ? setLoading(true) : setBackgroundRefreshing(true);
    setError(null);

    try {
      const fourMinAgo = new Date(Date.now() - 4 * 60 * 1000).toISOString();
      const { data: rows, error: err } = await supabase
        .from("matches")
        .select(
          "id,home_team,away_team,home_score,away_score,minute,status,competition,updated_at,start_time"
        )
        .in("status", ["live", "ht"])
        .gte("updated_at", fourMinAgo)
        .order("updated_at", { ascending: false });

      if (!mountedRef.current) return;

      if (err) {
        setError(err.message || "Fetch error");
        setMatches([]);
      } else {
        setMatches(rows ?? []);
        setLastRefreshed(Date.now());
      }
    } catch (e) {
      if (!mountedRef.current) return;
      setError(e.message || "Network error");
    } finally {
      if (!mountedRef.current) return;
      foreground ? setLoading(false) : setBackgroundRefreshing(false);
    }
  }, []);

  const refreshNow = useCallback(() => fetchOnce(true), [fetchOnce]);

  // ✅ Start initial load
  useEffect(() => {
    mountedRef.current = true;
    fetchOnce(true);
    return () => {
      mountedRef.current = false;
    };
  }, [fetchOnce]);

  // ✅ Supabase realtime (insert/update/delete) + soft merge
  useEffect(() => {
    const channel = supabase
      .channel("live-matches")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "matches" },
        (payload) => {
          const row = payload.new || payload.old || {};
          const st = String(row.status || "").toLowerCase();
          // samo live/ht nas zanima
          if (!["live", "ht"].includes(st)) return;

          lastRealtimeAtRef.current = Date.now();
          setIsRealtimeActive(true);

          setMatches((cur) => {
            const idx = cur.findIndex((m) => m.id === row.id);
            if (idx === -1) return [row, ...cur];
            const next = [...cur];
            next[idx] = { ...next[idx], ...row };
            return next;
          });
        }
      )
      .subscribe((status) => {
        setIsRealtimeActive(status === "SUBSCRIBED");
      });

    return () => {
      supabase.removeChannel(channel);
      setIsRealtimeActive(false);
    };
  }, []);

  // ✅ Dinamični polling + “realtime silent” fallback
  useEffect(() => {
    const scheduleNext = () => {
      const interval = pickInterval(liveCount);

      // Ako realtime nije ništa javio >12s (dvostruko od fast), napravi safety refresh
      const silentFor = Date.now() - lastRealtimeAtRef.current;
      const needSafety =
        isRealtimeActive && silentFor > Math.max(interval * 2, 12000);

      if (needSafety) {
        fetchOnce(false);
      }

      timerRef.current = setTimeout(() => {
        fetchOnce(false);
        scheduleNext();
      }, interval);
    };

    // očisti prethodni
    if (timerRef.current) clearTimeout(timerRef.current);
    scheduleNext();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [liveCount, isRealtimeActive, fetchOnce]);

  // ✅ pauza kad je prozor nevidljiv, nastavi kad se vrati
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") {
        fetchOnce(false);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [fetchOnce]);

  return {
    matches,
    liveCount,
    loading,
    backgroundRefreshing,
    error,
    lastRefreshed,
    isRealtimeActive,
    refreshNow,
    fetchLiveMatches: fetchOnce, // backward compat (prima true/false)
  };
}

export default useLiveMatches;
