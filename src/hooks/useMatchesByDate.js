// src/hooks/useMatchesByDate.js
import { useState, useEffect, useCallback, useRef } from "react";
import supabase from "../services/supabase";
import { reconcileScoresArray } from "../utils/reconcileScore";

const matchesCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000;

// Build stable cache key using the user's local civil date (so navigation is intuitive)
// Increment CACHE_VERSION when schema/derived fields logic changes (e.g., score reconciliation refactor)
const CACHE_VERSION = 2; // bumped from 1 -> 2 to invalidate stale entries lacking provider-first display_* fields
const getCacheKey = (date) => {
  if (!date) return "";
  return `${new Date(date).toDateString()}::v${CACHE_VERSION}`;
};

// Returns precise UTC day bounds for the *local* selected civil date.
// Example: If user timezone is UTC+2 and selects 2025-09-09, startUTC becomes 2025-09-08T22:00:00.000Z
// Previously we constructed "YYYY-MM-DDT00:00:00Z" which incorrectly shifted the window forward
// and dropped matches in the first local hours of the day.
const getDayBoundsUTC = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0); // local midnight
  const start = d.toISOString(); // correct UTC equivalent of local midnight
  const endDate = new Date(d.getTime());
  endDate.setDate(endDate.getDate() + 1);
  const end = endDate.toISOString();
  return { start, end };
};
const isCacheValid = (timestamp) => Date.now() - timestamp < CACHE_DURATION;

export default function useMatchesByDate(selectedDate, options = {}) {
  const { enabled = true } = options;
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [backgroundRefreshing, setBackgroundRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const abortControllerRef = useRef();
  const lastRequestIdRef = useRef(0);

  const getCachedMatches = useCallback((date) => {
    const cacheKey = getCacheKey(date);
    const cached = matchesCache.get(cacheKey);

    if (cached && isCacheValid(cached.timestamp)) {
      console.log(
        `📦 Cache hit for ${cacheKey} (${cached.data.length} matches)`
      );
      return cached.data;
    }
    return null;
  }, []);

  const setCachedMatches = useCallback((date, data) => {
    const cacheKey = getCacheKey(date);
    matchesCache.set(cacheKey, {
      data,
      timestamp: Date.now(),
    });
    console.log(`💾 Cached ${data.length} matches for ${cacheKey}`);
  }, []);

  const fetchMatches = useCallback(
    async (date, isBackgroundRefresh = false) => {
      if (!enabled || !date) return;

      const requestId = ++lastRequestIdRef.current;

      // Abort previous request
      if (abortControllerRef.current && !isBackgroundRefresh) {
        abortControllerRef.current.abort();
      }

      abortControllerRef.current = new AbortController();
      const currentController = abortControllerRef.current;

      try {
        // Check cache first (ne za background refresh)
        const cachedData = getCachedMatches(date);
        if (cachedData && !isBackgroundRefresh) {
          console.log(`✅ Cache hit for ${getCacheKey(date)}`);
          setMatches(cachedData);
          setLoading(false);
          setError(null);
          return cachedData;
        }

        // Set loading states
        if (isBackgroundRefresh) {
          setBackgroundRefreshing(true);
        } else {
          setLoading(true);
        }
        setError(null);

        //  Accurate UTC range for the selected *local* civil date
        const { start: dayStartUTC, end: dayEndUTC } = getDayBoundsUTC(date);
        const dbgLocal = new Date(date);
        console.log(`🔍 Fetching matches (request #${requestId})`);
        console.log(
          `📅 Local date: ${dbgLocal.toDateString()} | UTC window: ${dayStartUTC} -> ${dayEndUTC}`
        );

        const { data, error: fetchError } = await supabase
          .from("matches")
          .select(
            `
          id, home_team, away_team, home_score, away_score, start_time,
          status, status_type, competition, competition_id, season, round,
          venue, minute, home_color, away_color, source, updated_at
        `
          )
          //  Dodati Z za UTC timezone
          .gte("start_time", dayStartUTC)
          .lt("start_time", dayEndUTC)
          .order("start_time", { ascending: true })
          .abortSignal(currentController.signal);

        if (requestId !== lastRequestIdRef.current) {
          console.log(`⚠️ Request ${requestId} outdated, ignoring results`);
          return;
        }

        if (fetchError) {
          throw fetchError;
        }

        let matchesData = data || [];

        // Frontend zombie cleanup
        const now = new Date();
        matchesData = matchesData.map((match) => {
          const status = match.status?.toLowerCase();

          // Provjeri je li zombie match
          if ((status === "live" || status === "ht") && match.start_time) {
            const startTime = new Date(match.start_time);
            const hoursElapsed = (now - startTime) / (1000 * 60 * 60);

            if (hoursElapsed > 2) {
              console.warn(
                `🧟 Frontend zombie detected: ${match.home_team} vs ${match.away_team}`
              );
              return {
                ...match,
                status: "finished",
                status_type: "finished",
                minute: null,
              };
            }
          }

          return match;
        });

        // --- Score reconciliation (events vs stored scores) -----------------
        try {
          const ids = matchesData.map((m) => m.id);
          if (ids.length) {
            const { data: evRows, error: evErr } = await supabase
              .from("match_events")
              .select("match_id,event_type,team,minute,player_name,created_at")
              .in("match_id", ids);
            if (!evErr && Array.isArray(evRows)) {
              matchesData = reconcileScoresArray(matchesData, evRows);
            } else if (evErr) {
              console.warn("⚠️ Event fetch error for reconciliation", evErr);
            }
          }
        } catch (reErr) {
          console.warn("⚠️ Score reconciliation failed", reErr);
        }

        // Cache rezultate (with reconciliation augmentation)
        setCachedMatches(date, matchesData);
        setMatches(matchesData);

        console.log(
          `✅ Fetched ${
            matchesData.length
          } matches for ${dbgLocal.toDateString()} (request #${requestId})`
        );
        return matchesData;
      } catch (err) {
        if (err.name === "AbortError" || err.code === "20") {
          console.log(
            `🚫 Request ${requestId} aborted (newer request in progress)`
          );
          return;
        }

        if (requestId !== lastRequestIdRef.current) {
          console.log(`⚠️ Request ${requestId} error ignored (outdated)`);
          return;
        }

        console.error(
          `❌ Error fetching matches (request #${requestId}):`,
          err
        );
        setError(err.message);

        // Fallback to cached data
        const cachedData = getCachedMatches(date);
        if (cachedData) {
          console.log("📦 Using stale cache as fallback");
          setMatches(cachedData);
        } else {
          setMatches([]);
        }
      } finally {
        if (requestId === lastRequestIdRef.current) {
          setLoading(false);
          setBackgroundRefreshing(false);
        }
      }
    },
    [enabled, getCachedMatches, setCachedMatches]
  );

  // Main effect
  useEffect(() => {
    if (selectedDate) {
      fetchMatches(selectedDate);
    }
  }, [selectedDate, fetchMatches]);

  // Manual refetch
  const refetch = useCallback(() => {
    if (selectedDate) {
      const cacheKey = getCacheKey(selectedDate);
      matchesCache.delete(cacheKey);
      fetchMatches(selectedDate);
    }
  }, [selectedDate, fetchMatches]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    matches,
    loading,
    backgroundRefreshing,
    error,
    refetch,
  };
}
