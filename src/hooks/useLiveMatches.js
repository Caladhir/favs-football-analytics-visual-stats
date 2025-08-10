// src/hooks/useLiveMatches.js
import { useState, useEffect, useCallback } from "react";
import supabase from "../services/supabase";
import { getValidLiveMatchesRelaxed } from "../utils/liveMatchFilters";

export function useLiveMatches(autoFetch = true) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [backgroundRefreshing, setBackgroundRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchLiveMatches = useCallback(async (isBackgroundRefresh = false) => {
    try {
      if (!isBackgroundRefresh) {
        setLoading(true);
      } else {
        setBackgroundRefreshing(true);
      }

      setError(null);

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
        .in("status", ["live", "ht", "inprogress", "halftime"])
        .order("start_time", { ascending: false });

      if (fetchError) {
        throw fetchError;
      }

      const rawMatches = data || [];

      const validLiveMatches = getValidLiveMatchesRelaxed(rawMatches);

      setMatches(validLiveMatches);

      if (import.meta.env.DEV) {
        console.log(
          `🔴 Live matches fetched: ${validLiveMatches.length} valid (${rawMatches.length} total)`
        );

        if (validLiveMatches.length > 0) {
          console.log(
            "Sample live matches:",
            validLiveMatches
              .slice(0, 3)
              .map((m) => `${m.home_team} vs ${m.away_team} (${m.status})`)
          );
        }
      }
    } catch (err) {
      console.error("Error fetching live matches:", err);
      setError(err.message);
      if (!isBackgroundRefresh) {
        setMatches([]);
      }
    } finally {
      setLoading(false);
      setBackgroundRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (autoFetch) {
      fetchLiveMatches();
    }
  }, [fetchLiveMatches, autoFetch]);

  useEffect(() => {
    if (!autoFetch || matches.length === 0) return;

    const interval = setInterval(() => {
      fetchLiveMatches(true);
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchLiveMatches, autoFetch, matches.length]);

  return {
    matches,
    loading,
    backgroundRefreshing,
    error,
    fetchLiveMatches,
  };
}
