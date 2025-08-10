// src/hooks/useAllMatches.js - DEBUG VERZIJA
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import useMatchesByDate from "./useMatchesByDate";
import {
  getValidLiveMatches,
  findProblemMatches,
} from "../utils/matchStatusUtils";

export function useAllMatches(selectedDate) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const prevDateRef = useRef(null);
  const timerRef = useRef(null);
  const debugTimerRef = useRef(null);

  // 🔍 DEBUG: Log selected date
  console.log("🔍 useAllMatches - selectedDate:", selectedDate?.toISOString());

  // 🚀 OPTIMIZACIJA: Memoriziraj datum
  const memoizedDate = useMemo(() => {
    if (!selectedDate) {
      console.log("❌ No selectedDate provided");
      return null;
    }

    const dateKey = selectedDate.toDateString();
    const prevDateKey = prevDateRef.current?.toDateString();

    if (dateKey !== prevDateKey) {
      console.log(`📅 Date actually changed: ${prevDateKey} → ${dateKey}`);
      prevDateRef.current = selectedDate;
      return selectedDate;
    }

    return prevDateRef.current;
  }, [selectedDate?.toDateString()]);

  // 🔍 DEBUG: Log memoized date
  console.log("🔍 useAllMatches - memoizedDate:", memoizedDate?.toISOString());

  // Fetch matches
  const { matches, loading, backgroundRefreshing, error, refetch } =
    useMatchesByDate(memoizedDate, {
      enabled: !!memoizedDate,
    });

  // 🔍 DEBUG: Log fetch results
  console.log("🔍 useAllMatches - fetch results:", {
    matchesCount: matches?.length || 0,
    loading,
    error,
    date: memoizedDate?.toDateString(),
  });

  // 🔍 DEBUG: Log first few matches
  if (matches?.length > 0) {
    console.log(
      "🔍 useAllMatches - first 3 matches:",
      matches.slice(0, 3).map((m) => ({
        id: m.id,
        homeTeam: m.home_team,
        awayTeam: m.away_team,
        startTime: m.start_time,
        status: m.status,
      }))
    );
  }

  // Auto-refresh callback
  const handleAutoRefresh = useCallback(() => {
    if (refetch && typeof refetch === "function") {
      console.log("🔄 Auto-refresh triggered");
      refetch();
    }
  }, [refetch]);

  // Live matches timer
  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (!matches?.length) {
      console.log("⏹️ No matches - stopping UI timer");
      return;
    }

    const validLiveMatches = getValidLiveMatches(matches);

    if (validLiveMatches.length > 0) {
      console.log(
        `🔴 Found ${validLiveMatches.length} valid live matches - starting UI timer`
      );

      timerRef.current = setInterval(() => {
        setCurrentTime(new Date());
      }, 1000);
    } else {
      console.log("✅ No live matches found - stopping UI timer");
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [matches?.length]);

  // Debug problematičnih utakmica
  useEffect(() => {
    if (!import.meta.env.DEV || !matches?.length) return;

    if (debugTimerRef.current) {
      clearTimeout(debugTimerRef.current);
    }

    debugTimerRef.current = setTimeout(() => {
      const problemMatches = findProblemMatches(matches);

      if (problemMatches.length > 0) {
        console.group("🚨 PROBLEM MATCHES DETECTED");
        problemMatches.slice(0, 3).forEach((match) => {
          const hoursElapsed = (
            (new Date() - new Date(match.start_time)) /
            (1000 * 60 * 60)
          ).toFixed(1);
          console.warn(`${match.home_team} vs ${match.away_team}`, {
            status: match.status,
            startTime: match.start_time,
            minute: match.minute,
            hoursElapsed,
          });
        });
        if (problemMatches.length > 3) {
          console.log(`... and ${problemMatches.length - 3} more problems`);
        }
        console.groupEnd();
      }
    }, 2000);

    return () => {
      if (debugTimerRef.current) {
        clearTimeout(debugTimerRef.current);
      }
    };
  }, [matches?.length]);

  // Cleanup na unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (debugTimerRef.current) {
        clearTimeout(debugTimerRef.current);
      }
    };
  }, []);

  return {
    matches,
    loading,
    backgroundRefreshing,
    currentTime,
    handleAutoRefresh,
    error, // 🔍 DEBUG: Dodaj error u return
  };
}
