// src/hooks/useLiveMatches.js
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import supabase from "../services/supabase";
import { parseMatchISO } from "../utils/formatMatchTime";
import {
  getValidLiveMatchesStrict,
  getLiveWithFallback,
} from "../utils/liveMatchFilters";
import { reconcileScoresArray } from "../utils/reconcileScore";

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
  const [liveMode, setLiveMode] = useState("strict"); // "strict" | "relaxed"

  const mountedRef = useRef(true);
  const timerRef = useRef(null);
  const lastRealtimeAtRef = useRef(0);
  const lastFetchAtRef = useRef(0);
  const MIN_FETCH_MS = 800;

  const liveCount = useMemo(() => matches.length, [matches]);

  const pickInterval = (count) => {
    if (count > 50) return INTERVALS.ultra;
    if (count >= 15) return INTERVALS.fast;
    if (count >= 1) return INTERVALS.normal;
    return INTERVALS.idle;
  };

  const previousNonEmptyRef = useRef([]);
  const fetchOnce = useCallback(async (foreground = false) => {
    if (!mountedRef.current) return;
    const now = Date.now();
    // if a very recent fetch happened, skip unless foreground
    if (!foreground && now - lastFetchAtRef.current < MIN_FETCH_MS) return;
    // prevent overlapping fetches
    if (fetchOnce._inFlight) return;
    fetchOnce._inFlight = true;
    lastFetchAtRef.current = now;

    foreground ? setLoading(true) : setBackgroundRefreshing(true);
    setError(null);

    try {
      const fourMinAgo = new Date(Date.now() - 4 * 60 * 1000).toISOString();
      // For foreground (initial/manual) fetches, don't restrict by `updated_at` so
      // matches recently marked live but not updated within the last 4 minutes are still returned.
      const query = supabase
        .from("matches")
        .select(
          "id,home_team,away_team,home_score,away_score,minute,status,competition,updated_at,start_time"
        )
        // include all common live-status variants from backend
        .in("status", ["live", "ht", "inprogress", "halftime"]);

      if (!foreground) {
        query.gte("updated_at", fourMinAgo);
      }

      const { data: rows, error: err } = await query.order("updated_at", {
        ascending: false,
      });

      if (!mountedRef.current) return;

      if (err) {
        console.warn("❌ live fetch error", err);
        setError(err.message || "Fetch error");
        // SAFEGUARD: keep previous list if we had data
        setMatches((cur) => (cur.length ? cur : []));
      } else {
        // Filter out matches that are not actually started yet (start_time more than 10 minutes in future)
        const now = Date.now();
        const rowsFiltered = (rows || []).filter((r) => {
          try {
            const d = parseMatchISO(r.start_time);
            if (!d) return true; // keep if unknown
            // if start_time more than 10 minutes in the future, exclude from live list
            return d.getTime() <= now + 10 * 60 * 1000;
          } catch {
            return true;
          }
        });

        // Apply unified live-match filter to ensure finished/stale matches are excluded
        const beforeCount = rowsFiltered.length;
        const { list: valid, mode } = getLiveWithFallback(rowsFiltered);
        setLiveMode(mode);
        if (
          beforeCount > 0 &&
          valid.length === 0 &&
          previousNonEmptyRef.current.length
        ) {
          console.warn(
            "⚠️ Live filter 0 despite candidates; preserving previousNonEmpty (grace)."
          );
          setMatches(previousNonEmptyRef.current);
        } else {
          // Reconcile scores with events (batch fetch) only if list changed length or ids changed
          let finalList = valid;
          try {
            if (valid.length) {
              const ids = valid.map((m) => m.id);
              const { data: evRows, error: evErr } = await supabase
                .from("match_events")
                .select("match_id,event_type,team,minute,player_name")
                .in("match_id", ids);
              if (!evErr && Array.isArray(evRows)) {
                finalList = reconcileScoresArray(valid, evRows);
              }
            }
          } catch (reErr) {
            console.warn("⚠️ live reconcile failed", reErr);
          }
          setMatches(finalList);
          if (finalList.length > 0) previousNonEmptyRef.current = finalList;
        }
        setLastRefreshed(Date.now());
      }
    } catch (e) {
      if (!mountedRef.current) return;
      setError(e.message || "Network error");
    } finally {
      if (!mountedRef.current) return;
      foreground ? setLoading(false) : setBackgroundRefreshing(false);
      fetchOnce._inFlight = false;
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

          // Only proceed if the row might be a live variant -- detailed filtering below
          if (!["live", "ht", "inprogress", "halftime"].includes(st)) return;

          // merge candidate into current list, then re-run strict validation to avoid adding finished/stale matches
          lastRealtimeAtRef.current = Date.now();
          setIsRealtimeActive(true);

          setMatches((cur) => {
            const merged = (() => {
              const idx = cur.findIndex((m) => m.id === row.id);
              if (idx === -1) return [row, ...cur];
              const next = [...cur];
              next[idx] = { ...next[idx], ...row };
              return next;
            })();

            // Apply fallback pipeline to merged list
            try {
              const { list, mode } = getLiveWithFallback(merged);
              setLiveMode(mode);
              if (list.length > 0) previousNonEmptyRef.current = list;
              return list;
            } catch {
              return merged;
            }
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

      // Debounce/min interval: ensure at least 800ms between scheduled fetches
      const nextInterval = Math.max(800, interval);

      timerRef.current = setTimeout(() => {
        // guard: don't start a new fetch if one is still running
        if (!fetchOnce._inFlight) fetchOnce(false);
        scheduleNext();
      }, nextInterval);
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
    liveMode,
    fetchLiveMatches: fetchOnce, // backward compat (prima true/false)
  };
}

export default useLiveMatches;
