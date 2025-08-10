// src/hooks/useMatchesByDate.js - ISPRAVLJEN za sprječavanje AbortError-a
import { useState, useEffect, useCallback, useRef } from "react";
import supabase from "../services/supabase";

// Cache za matches po datumu
const matchesCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minuta

// Cache utilities
const getCacheKey = (date) => {
  return date.toISOString().split("T")[0];
};

const isCacheValid = (timestamp) => {
  return Date.now() - timestamp < CACHE_DURATION;
};

export default function useMatchesByDate(selectedDate, options = {}) {
  const { enabled = true } = options;
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [backgroundRefreshing, setBackgroundRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // 🔧 ISPRAVKA: Jedan AbortController per hook instance
  const abortControllerRef = useRef();
  const lastRequestIdRef = useRef(0);
  const isFirstLoadRef = useRef(true);

  // Cache utilities
  const getCachedMatches = useCallback((date) => {
    const cacheKey = getCacheKey(date);
    const cached = matchesCache.get(cacheKey);

    if (cached && isCacheValid(cached.timestamp)) {
      console.log(
        `📦 Using cached matches for ${cacheKey} (${cached.data.length} matches)`
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

  // 🔧 POBOLJŠANO: Fetch function s boljim error handling
  const fetchMatches = useCallback(
    async (date, isBackgroundRefresh = false) => {
      if (!enabled || !date) return;

      // 🔧 VAŽNO: Increment request ID za tracking
      const requestId = ++lastRequestIdRef.current;

      // Cancel any ongoing request samo ako je novi request
      if (abortControllerRef.current && !isBackgroundRefresh) {
        abortControllerRef.current.abort();
      }

      // Create new abort controller
      abortControllerRef.current = new AbortController();
      const currentController = abortControllerRef.current;

      try {
        // 🔧 OPTIMIZACIJA: Check cache first
        const cachedData = getCachedMatches(date);
        if (cachedData && !isBackgroundRefresh) {
          console.log(`✅ Cache hit for ${getCacheKey(date)}`);
          setMatches(cachedData);
          setLoading(false);
          setError(null);
          return cachedData;
        }

        // Samo postavi loading za first load ili ako nema cache
        if (!isBackgroundRefresh && (isFirstLoadRef.current || !cachedData)) {
          setLoading(true);
          isFirstLoadRef.current = false;
        } else if (isBackgroundRefresh) {
          setBackgroundRefreshing(true);
        }

        setError(null);

        // Format date for SQL query
        const dateStr = date.toISOString().split("T")[0];
        const nextDay = new Date(date);
        nextDay.setDate(nextDay.getDate() + 1);
        const nextDayStr = nextDay.toISOString().split("T")[0];

        console.log(
          `🔍 Fetching matches for ${dateStr} (request #${requestId})`
        );

        const { data, error: fetchError } = await supabase
          .from("matches")
          .select(
            `
          id, home_team, away_team, home_score, away_score, start_time,
          status, status_type, competition, competition_id, season, round,
          venue, minute, home_color, away_color, current_period_start,
          source, updated_at
        `
          )
          .gte("start_time", `${dateStr}T00:00:00`)
          .lt("start_time", `${nextDayStr}T00:00:00`)
          .order("start_time", { ascending: true })
          .abortSignal(currentController.signal);

        // 🔧 PROVJERI: Je li ovo još uvijek latest request?
        if (requestId !== lastRequestIdRef.current) {
          console.log(`⚠️ Request ${requestId} outdated, ignoring results`);
          return;
        }

        if (fetchError) {
          throw fetchError;
        }

        const matchesData = data || [];

        // Cache rezultate
        setCachedMatches(date, matchesData);

        setMatches(matchesData);
        console.log(
          `✅ Fetched ${matchesData.length} matches for ${dateStr} (request #${requestId})`
        );

        return matchesData;
      } catch (err) {
        // 🔧 POBOLJŠANO: Ignoriraj abort errors ako nije latest request
        if (err.name === "AbortError" || err.code === "20") {
          console.log(
            `🚫 Request ${requestId} aborted (newer request in progress)`
          );
          return;
        }

        // 🔧 PROVJERI: Je li ovo još uvijek latest request?
        if (requestId !== lastRequestIdRef.current) {
          console.log(`⚠️ Request ${requestId} error ignored (outdated)`);
          return;
        }

        console.error(
          `❌ Error fetching matches (request #${requestId}):`,
          err
        );
        setError(err.message);

        // Fallback to cache
        const cachedData = getCachedMatches(date);
        if (cachedData) {
          console.log(
            `📦 Using cached data as fallback for ${getCacheKey(date)}`
          );
          setMatches(cachedData);
        } else {
          setMatches([]);
        }
      } finally {
        // 🔧 PROVJERI: Postavi loading states samo za latest request
        if (requestId === lastRequestIdRef.current) {
          setLoading(false);
          setBackgroundRefreshing(false);
        }
      }
    },
    [enabled, getCachedMatches, setCachedMatches]
  );

  // Refetch function
  const refetch = useCallback(() => {
    console.log(`🔄 Manual refetch for ${getCacheKey(selectedDate)}`);
    return fetchMatches(selectedDate, true);
  }, [fetchMatches, selectedDate]);

  // 🔧 OPTIMIZIRANO: Initial fetch + when date changes
  useEffect(() => {
    if (selectedDate && enabled) {
      const dateKey = getCacheKey(selectedDate);
      console.log(`📅 Date changed to ${dateKey}, fetching matches...`);
      fetchMatches(selectedDate);
    }
  }, [selectedDate, enabled, fetchMatches]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        console.log("🧹 Cleanup: Aborted ongoing request");
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

// 🔧 UTILITY: Clear cache (za debugging)
export const clearMatchesCache = () => {
  matchesCache.clear();
  console.log("🗑️ Matches cache cleared");
};

// 🔧 UTILITY: Get cache stats
export const getCacheStats = () => {
  const stats = {
    size: matchesCache.size,
    keys: Array.from(matchesCache.keys()),
    totalItems: Array.from(matchesCache.values()).reduce(
      (acc, cache) => acc + cache.data.length,
      0
    ),
  };
  console.log("📊 Cache stats:", stats);
  return stats;
};
