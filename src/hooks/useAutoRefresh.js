// src/hooks/useAutoRefresh.js - ULTRA FAST LIVE REFRESH
import { useEffect, useRef } from "react";
import { getValidLiveMatches } from "../utils/liveMatchFilters";

/**
 * 🚀 ULTRA FAST auto-refresh for live situations
 */
export function useAutoRefresh(
  matches = [],
  refreshCallback,
  liveInterval = 2000, // 🔧 ULTRA BRZO: 2s base za live
  idleInterval = 30000 // Idle ostaje 30s
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

    // 🚀 ULTRA AGRESIVNI INTERVALI based on live count
    let actualInterval;
    if (hasLive) {
      if (liveMatches.length >= 100) {
        actualInterval = 1500; // 1.5s za 100+ live utakmica - ULTRA FAST
      } else if (liveMatches.length >= 50) {
        actualInterval = 2000; // 2s za 50+ live utakmica
      } else if (liveMatches.length >= 20) {
        actualInterval = 2500; // 2.5s za 20+ live utakmica
      } else if (liveMatches.length >= 10) {
        actualInterval = 3000; // 3s za 10+ live utakmica
      } else {
        actualInterval = liveInterval; // 2s za malo live utakmica
      }
    } else {
      actualInterval = idleInterval; // 30s kad nema live
    }

    if (hasLive) {
      console.log(
        `🚀 ULTRA-REFRESH enabled: ${liveMatches.length} live matches (every ${
          actualInterval / 1000
        }s)`
      );

      intervalRef.current = setInterval(() => {
        console.log(
          `🚀 Ultra-refreshing ${liveMatches.length} live matches...`
        );
        if (callbackRef.current) {
          callbackRef.current();
        }
      }, actualInterval);
    } else {
      console.log("✅ No live matches - auto-refresh disabled");
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
