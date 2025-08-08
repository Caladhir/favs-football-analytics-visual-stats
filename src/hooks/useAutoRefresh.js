// src/hooks/useAutoRefresh.js
import { useEffect, useRef } from "react";
import { getValidLiveMatches } from "../utils/matchStatusUtils";

/**
 * Hook koji automatski refresha podatke kada postoje live utakmice
 * @param {Array} matches - Lista utakmica
 * @param {Function} refreshCallback - Funkcija za refresh podataka
 * @param {number} interval - Interval u milisekundama (default: 30s)
 */
export function useAutoRefresh(
  matches = [],
  refreshCallback,
  interval = 30000
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

    if (liveMatches.length > 0) {
      console.log(
        `🔄 Auto-refresh enabled for ${
          liveMatches.length
        } live matches (every ${interval / 1000}s)`
      );

      // Postavi interval za refresh
      intervalRef.current = setInterval(() => {
        console.log("🔄 Auto-refreshing live matches...");
        if (callbackRef.current) {
          callbackRef.current();
        }
      }, interval);
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
  }, [matches, interval]); // Ovisi o matches i interval

  // Cleanup kad se komponenta unmountira
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);
}
