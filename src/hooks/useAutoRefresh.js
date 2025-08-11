// src/hooks/useAutoRefresh.js
import { useEffect, useRef } from "react";
import { getValidLiveMatches } from "../utils/liveMatchFilters";
import { LIVE_REFRESH_MS, IDLE_REFRESH_MS } from "../services/live";

export function useAutoRefresh(
  matches = [],
  refresh,
  liveMs = LIVE_REFRESH_MS,
  idleMs = IDLE_REFRESH_MS
) {
  const intervalRef = useRef(null);
  const cbRef = useRef(refresh);
  useEffect(() => {
    cbRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    const hasLive = getValidLiveMatches(matches).length > 0;
    const period = hasLive ? liveMs : idleMs;

    intervalRef.current = setInterval(() => {
      if (cbRef.current) cbRef.current();
    }, period);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [matches, liveMs, idleMs]);

  useEffect(
    () => () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    },
    []
  );
}
