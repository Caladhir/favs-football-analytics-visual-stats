import { useState, useEffect, useCallback } from "react";
import supabase from "../services/supabase";
import { getValidLiveMatchesRelaxed } from "../utils/liveMatchFilters";
import { findProblemMatches } from "../utils/matchStatusUtils";

export function useLiveMatches() {
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

      // 🔧 KORISTI NOVO BLAŽJI FILTER
      const validLiveMatches = getValidLiveMatchesRelaxed(rawMatches);

      // 🔧 DEBUG: Analiziraj what we filtered out
      if (import.meta.env.DEV) {
        const filtered = rawMatches.filter(
          (m) => !validLiveMatches.includes(m)
        );
        if (filtered.length > 0) {
          console.group("🔍 FILTERED OUT MATCHES");
          filtered.slice(0, 5).forEach((match) => {
            const startTime = new Date(match.start_time);
            const hoursElapsed = (
              (new Date() - startTime) /
              (1000 * 60 * 60)
            ).toFixed(1);
            console.log(
              `❌ ${match.home_team} vs ${match.away_team} (${hoursElapsed}h old)`
            );
          });
          if (filtered.length > 5) {
            console.log(`... and ${filtered.length - 5} more filtered matches`);
          }
          console.groupEnd();
        }

        // Analiziraj distribuciju po ligama
        const leagueDistribution = validLiveMatches.reduce((acc, match) => {
          const league = match.competition || "Unknown";
          acc[league] = (acc[league] || 0) + 1;
          return acc;
        }, {});

        console.log("🏆 League distribution:", leagueDistribution);
      }

      setMatches(validLiveMatches);

      if (isBackgroundRefresh) {
        console.log(
          `🔄 Live matches refresh: ${validLiveMatches.length} matches`
        );
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

  // Debug problematičnih utakmica
  useEffect(() => {
    if (import.meta.env.DEV && matches.length > 0) {
      const problemMatches = findProblemMatches(matches, false);

      if (problemMatches.length > 0) {
        console.group("🚨 LIVE TAB - PROBLEM MATCHES");
        problemMatches.forEach((match) => {
          console.warn(`${match.home_team} vs ${match.away_team}`, {
            problemType: match.problemType,
            status: match.status,
            startTime: match.start_time,
            minute: match.minute,
            hoursElapsed: match.hoursElapsed,
          });
        });
        console.groupEnd();
      }
    }
  }, [matches]);

  return {
    matches,
    loading,
    backgroundRefreshing,
    error,
    fetchLiveMatches,
  };
}
