// src/hooks/useAutoRefresh.js - BRŽI REFRESH ZA LIVE
import { useEffect, useRef } from "react";
import { getValidLiveMatches } from "../utils/liveMatchFilters";

/**
 * Hook koji automatski refresha podatke kada postoje live utakmice
 * 🚀 POBOLJŠANO: Brži refresh za bolju sinkronizaciju
 */
export function useAutoRefresh(
  matches = [],
  refreshCallback,
  liveInterval = 3000, // 🔧 ULTRA BRZO: 3s za live
  idleInterval = 30000 // Idle ostaje 30s
) {
  const intervalRef = useRef(null);
  const callbackRef = useRef(refreshCallback);

  // Ažuriraj callback ref kad se promijeni
  useEffect(() => {
    callbackRef.current = refreshCallback;
  }, [refreshCallback]);

  useEffect(() => {
    // Očisti postojeći interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Provjeri ima li live utakmica
    const liveMatches = getValidLiveMatches(matches);
    const hasLive = liveMatches.length > 0;

    // 🚀 ULTRA BRZI INTERVALI - brži kad ima puno live utakmica
    let actualInterval;
    if (hasLive) {
      if (liveMatches.length >= 50) {
        actualInterval = 2000; // 2s za puno live utakmica (50+)
      } else if (liveMatches.length >= 20) {
        actualInterval = 3000; // 3s za umjereno puno (20+)
      } else if (liveMatches.length >= 10) {
        actualInterval = 4000; // 4s za srednje (10+)
      } else {
        actualInterval = liveInterval; // 3s za malo live utakmica
      }
    } else {
      actualInterval = idleInterval; // 30s kad nema live
    }

    if (hasLive) {
      console.log(
        `🔄 Auto-refresh enabled: ${liveMatches.length} live matches (every ${
          actualInterval / 1000
        }s)`
      );

      // Postavi interval za refresh
      intervalRef.current = setInterval(() => {
        console.log(`🔄 Auto-refreshing ${liveMatches.length} live matches...`);
        if (callbackRef.current) {
          callbackRef.current();
        }
      }, actualInterval);
    } else {
      console.log("✅ No live matches - auto-refresh disabled");
    }

    // Cleanup funkcija
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [matches, liveInterval, idleInterval]);

  // Cleanup kad se komponenta unmountira
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);
}
