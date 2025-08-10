// src/hooks/useAutoRefresh.js - OČIŠĆENO
import { useEffect, useRef } from "react";
import { getValidLiveMatches } from "../utils/matchStatusUtils";

/*
  Hook koji automatski refresha podatke kada postoje live utakmice
 */
export function useAutoRefresh(
  matches = [],
  refreshCallback,
  interval = 30000
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

    if (liveMatches.length > 0) {
      intervalRef.current = setInterval(() => {
        if (callbackRef.current) {
          callbackRef.current();
        }
      }, interval);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [matches, interval]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);
}
