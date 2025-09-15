// src/hooks/useAutoRefresh.js - ULTRA FAST LIVE REFRESH
import { useEffect, useRef } from "react";
import { getValidLiveMatches } from "../utils/liveMatchFilters";

/**
 * 🚀 ULTRA FAST auto-refresh for live situations
 */
export function useAutoRefresh(
  matches = [],
  refreshCallback,
  liveInterval = 10000, // Slower default: 10s
  idleInterval = 60000 // Idle: 60s
) {
  const intervalRef = useRef(null);
  const callbackRef = useRef(refreshCallback);

  useEffect(() => {
    callbackRef.current = refreshCallback;
  }, [refreshCallback]);

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    const liveMatches = getValidLiveMatches(matches);
    const hasLive = liveMatches.length > 0;

    // Dinamički intervali prema broju live utakmica (smanjeno opterećenje)
    let actualInterval;
    if (hasLive) {
      if (liveMatches.length >= 100)
        actualInterval = Math.min(liveInterval, 8000);
      else if (liveMatches.length >= 50)
        actualInterval = Math.min(liveInterval, 9000);
      else if (liveMatches.length >= 20) actualInterval = liveInterval;
      else if (liveMatches.length >= 10) actualInterval = liveInterval;
      else actualInterval = liveInterval; // uvijek >= 10s sada
    } else {
      actualInterval = idleInterval; // 30s kad nema live
    }

    if (hasLive) {
      console.log(
        `♻️ Auto-refresh: ${liveMatches.length} live matches (interval ${(
          actualInterval / 1000
        ).toFixed(1)}s)`
      );

      intervalRef.current = setInterval(() => {
        console.log(`Refreshing live matches (${liveMatches.length})...`);
        if (callbackRef.current) {
          callbackRef.current();
        }
      }, actualInterval);
    } else {
      console.log("✅ No live matches - auto-refresh idle");
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [matches, liveInterval, idleInterval]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);
}
