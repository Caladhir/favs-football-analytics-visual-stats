// src/hooks/useAllMatches.js
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import useMatchesByDate from "./useMatchesByDate";
import { getValidLiveMatches } from "../utils/matchStatusUtils";

export function useAllMatches(selectedDate) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const prevDateRef = useRef(null);
  const timerRef = useRef(null);

  const memoizedDate = useMemo(() => {
    if (!selectedDate) return null;

    const dateKey = selectedDate.toDateString();
    const prevDateKey = prevDateRef.current?.toDateString();

    if (dateKey !== prevDateKey) {
      prevDateRef.current = selectedDate;
      return selectedDate;
    }

    return prevDateRef.current;
  }, [selectedDate?.toDateString()]);

  const { matches, loading, backgroundRefreshing, error, refetch } =
    useMatchesByDate(memoizedDate, {
      enabled: !!memoizedDate,
    });

  const handleAutoRefresh = useCallback(() => {
    if (refetch && typeof refetch === "function") {
      refetch();
    }
  }, [refetch]);

  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (!matches?.length) return;

    const validLiveMatches = getValidLiveMatches(matches, 8);

    if (validLiveMatches.length > 0) {
      timerRef.current = setInterval(() => {
        setCurrentTime(new Date());
      }, 1000);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [matches?.length]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  return {
    matches,
    loading,
    backgroundRefreshing,
    currentTime,
    handleAutoRefresh,
    error,
  };
}
