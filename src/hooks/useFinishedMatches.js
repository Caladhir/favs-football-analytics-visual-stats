// src/hooks/useFinishedMatches.js - SPECIALIZED HOOK FOR FINISHED MATCHES
import { useState, useEffect, useMemo } from "react";
import useMatchesByDate from "./useMatchesByDate";
import { useAutoRefresh } from "./useAutoRefresh";
import {
  sortMatches,
  useUserPreferences,
  getLeaguePriority,
  isUserFavorite,
} from "../utils/matchSortingUtils";

/**
 * Provjeri je li utakmica završena
 */
function isMatchFinished(match, currentTime = new Date()) {
  const status = match.status?.toLowerCase()?.trim() || "";

  // Eksplicitno završeni statusi
  const finishedStatuses = [
    "finished",
    "ft",
    "full_time",
    "ended",
    "final",
    "afterextra",
    "penalties",
    "penalty_shootout",
    "fulltime",
    "match_finished",
  ];

  if (finishedStatuses.includes(status)) {
    return true;
  }

  // Zombie detection - live/ht utakmice koje traju predugo
  const zombieStatuses = ["live", "ht", "inprogress", "halftime", "inplay"];
  if (zombieStatuses.includes(status)) {
    try {
      const matchStart = new Date(match.start_time);
      const hoursElapsed = (currentTime - matchStart) / (1000 * 60 * 60);

      // Ako je prošlo više od 3 sata, tretiramo kao finished
      if (hoursElapsed > 3) {
        if (import.meta.env.DEV) {
          console.warn(
            `🧟 Zombie match detected: ${match.home_team} vs ${
              match.away_team
            } (${hoursElapsed.toFixed(1)}h ago)`
          );
        }
        return true;
      }
    } catch (error) {
      console.warn("Error calculating match duration:", error);
    }
  }

  return false;
}

/**
 * Provjeri je li utakmica na određenom datumu
 */
function isMatchOnDate(match, targetDate) {
  try {
    const matchDate = new Date(match.start_time);
    const target = new Date(targetDate);

    // Postaviti oba datuma na početak dana
    matchDate.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);

    return matchDate.getTime() === target.getTime();
  } catch (error) {
    console.warn("Error comparing dates:", error);
    return false;
  }
}

/**
 * Ukloni duplikate
 */
function removeDuplicates(matches) {
  const seen = new Map();
  const deduped = [];

  for (const match of matches) {
    const key = [
      match.id,
      match.home_team?.toLowerCase()?.trim(),
      match.away_team?.toLowerCase()?.trim(),
      match.start_time,
      match.competition?.toLowerCase()?.trim(),
    ]
      .filter(Boolean)
      .join("|");

    if (!seen.has(key)) {
      seen.set(key, match);
      deduped.push(match);
    } else {
      // Zadržaj noviji update
      const existing = seen.get(key);
      const existingUpdate = new Date(existing.updated_at || 0);
      const currentUpdate = new Date(match.updated_at || 0);

      if (currentUpdate > existingUpdate) {
        const index = deduped.findIndex((m) => seen.get(key) === m);
        if (index !== -1) {
          deduped[index] = match;
          seen.set(key, match);
        }
      }
    }
  }

  return deduped;
}

export function useFinishedMatches(selectedDate, options = {}) {
  const {
    timeFilter = "selected", // selected, today, yesterday, week, all
    priorityFilter = "all", // all, top, regional
    resultFilter = "all", // all, withGoals, draws, highScoring
    autoRefresh = true,
  } = options;

  const userPreferences = useUserPreferences();

  // Koristimo useMatchesByDate za osnovu
  const { matches, loading, backgroundRefreshing, error, refetch } =
    useMatchesByDate(selectedDate, { enabled: !!selectedDate });

  // 🔧 STEP 1: Filtriraj finished matches s deduplication
  const finishedMatches = useMemo(() => {
    if (!matches || matches.length === 0) return [];

    const currentTime = new Date();

    // Filtriraj finished matches
    const finished = matches.filter((match) =>
      isMatchFinished(match, currentTime)
    );

    // Ukloni duplikate
    const deduped = removeDuplicates(finished);

    if (import.meta.env.DEV) {
      console.log(
        `🏁 Finished matches: ${matches.length} total → ${finished.length} finished → ${deduped.length} after deduplication`
      );
    }

    return deduped;
  }, [matches]);

  // 🔧 STEP 2: Primijeni time filter
  const timeFilteredMatches = useMemo(() => {
    if (!finishedMatches.length) return [];

    if (timeFilter === "all") return finishedMatches;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const weekStart = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

    return finishedMatches.filter((match) => {
      switch (timeFilter) {
        case "selected":
          return isMatchOnDate(match, selectedDate);
        case "today":
          return new Date(match.start_time) >= today;
        case "yesterday":
          const matchDate = new Date(match.start_time);
          return matchDate >= yesterday && matchDate < today;
        case "week":
          return new Date(match.start_time) >= weekStart;
        default:
          return true;
      }
    });
  }, [finishedMatches, timeFilter, selectedDate]);

  // 🔧 STEP 3: Primijeni priority filter
  const priorityFilteredMatches = useMemo(() => {
    if (!timeFilteredMatches.length || priorityFilter === "all") {
      return timeFilteredMatches;
    }

    return timeFilteredMatches.filter((match) => {
      const priority = getLeaguePriority(match.competition);

      switch (priorityFilter) {
        case "top":
          return priority >= 80;
        case "regional":
          return priority >= 20 && priority < 80;
        default:
          return true;
      }
    });
  }, [timeFilteredMatches, priorityFilter]);

  // 🔧 STEP 4: Primijeni result filter
  const resultFilteredMatches = useMemo(() => {
    if (!priorityFilteredMatches.length || resultFilter === "all") {
      return priorityFilteredMatches;
    }

    return priorityFilteredMatches.filter((match) => {
      const homeScore = match.home_score ?? 0;
      const awayScore = match.away_score ?? 0;
      const totalGoals = homeScore + awayScore;

      switch (resultFilter) {
        case "withGoals":
          return totalGoals > 0;
        case "draws":
          return homeScore === awayScore;
        case "highScoring":
          return totalGoals >= 3;
        default:
          return true;
      }
    });
  }, [priorityFilteredMatches, resultFilter]);

  // 🔧 STEP 5: Smart sorting
  const sortedMatches = useMemo(() => {
    if (!resultFilteredMatches.length) return [];

    return sortMatches(resultFilteredMatches, {
      prioritizeUserFavorites: userPreferences.sortingEnabled,
      favoriteTeams: userPreferences.favoriteTeams,
      favoriteLeagues: userPreferences.favoriteLeagues,
      currentTime: new Date(),
      debugMode: import.meta.env.DEV,
    });
  }, [resultFilteredMatches, userPreferences]);

  // 🔧 STEP 6: Generate statistics
  const stats = useMemo(() => {
    if (!finishedMatches.length) return null;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const weekStart = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

    return {
      selectedDate: finishedMatches.filter((m) =>
        isMatchOnDate(m, selectedDate)
      ).length,
      today: finishedMatches.filter((m) => new Date(m.start_time) >= today)
        .length,
      yesterday: finishedMatches.filter((m) => {
        const matchDate = new Date(m.start_time);
        return matchDate >= yesterday && matchDate < today;
      }).length,
      thisWeek: finishedMatches.filter(
        (m) => new Date(m.start_time) >= weekStart
      ).length,
      topLeagues: finishedMatches.filter(
        (m) => getLeaguePriority(m.competition) >= 80
      ).length,
      withGoals: finishedMatches.filter(
        (m) => (m.home_score ?? 0) + (m.away_score ?? 0) > 0
      ).length,
      draws: finishedMatches.filter(
        (m) => (m.home_score ?? 0) === (m.away_score ?? 0)
      ).length,
      highScoring: finishedMatches.filter(
        (m) => (m.home_score ?? 0) + (m.away_score ?? 0) >= 3
      ).length,
    };
  }, [finishedMatches, selectedDate]);

  // Display statistics
  const topLeaguesCount = sortedMatches.filter(
    (m) => getLeaguePriority(m.competition) > 80
  ).length;
  const favoritesCount = sortedMatches.filter((m) =>
    isUserFavorite(
      m,
      userPreferences.favoriteTeams,
      userPreferences.favoriteLeagues
    )
  ).length;

  // Auto-refresh every 5 minutes (finished matches change rarely)
  useAutoRefresh(
    matches,
    refetch,
    60000, // 1min for live (not applicable here but keeping consistent)
    300000 // 5min for idle/finished
  );

  return {
    // Raw data
    matches: sortedMatches,
    allFinishedMatches: finishedMatches,

    // Loading states
    loading,
    backgroundRefreshing,
    error,

    // Statistics
    stats,
    topLeaguesCount,
    favoritesCount,
    totalCount: sortedMatches.length,

    // Actions
    refetch,

    // Debug info
    debugInfo: import.meta.env.DEV
      ? {
          totalMatches: matches?.length || 0,
          finishedMatches: finishedMatches.length,
          timeFiltered: timeFilteredMatches.length,
          priorityFiltered: priorityFilteredMatches.length,
          resultFiltered: resultFilteredMatches.length,
          finalSorted: sortedMatches.length,
        }
      : null,
  };
}
