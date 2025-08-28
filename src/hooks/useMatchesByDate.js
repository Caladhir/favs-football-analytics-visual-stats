// src/hooks/useMatchesByDate.js
import { useState, useEffect, useCallback, useRef } from "react";
import supabase from "../services/supabase";

const matchesCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000;

const formatDateForDB = (date) => {
  if (!date) return null;

  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const getCacheKey = (date) => formatDateForDB(date);
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

        //  Date range calculation
        const dateStr = formatDateForDB(date);
        const nextDay = new Date(date);
        nextDay.setDate(nextDay.getDate() + 1);
        const nextDayStr = formatDateForDB(nextDay);

        console.log(
          `🔍 Fetching matches for ${dateStr} (request #${requestId})`
        );
        console.log(
          `📅 Date range: ${dateStr}T00:00:00Z to ${nextDayStr}T00:00:00Z`
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
          .gte("start_time", `${dateStr}T00:00:00Z`)
          .lt("start_time", `${nextDayStr}T00:00:00Z`)
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

        // Cache rezultate
        setCachedMatches(date, matchesData);
        setMatches(matchesData);

        console.log(
          `✅ Fetched ${matchesData.length} matches for ${dateStr} (request #${requestId})`
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
