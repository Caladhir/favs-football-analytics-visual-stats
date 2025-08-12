// src/hooks/useUpcomingMatches.js - SPECIALIZED HOOK FOR UPCOMING MATCHES
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
 * Provjeri je li utakmica upcoming/scheduled
 */
function isMatchUpcoming(match, currentTime = new Date()) {
  const status = match.status?.toLowerCase()?.trim() || "";

  // Eksplicitno upcoming statusi
  const upcomingStatuses = [
    "upcoming",
    "notstarted",
    "scheduled",
    "not_started",
    "ns",
    "fixture",
    "tbd",
    "to_be_determined",
  ];

  if (upcomingStatuses.includes(status)) {
    return true;
  }

  // Također provjeri da li je match u budućnosti (za slučajeve gdje status nije jasno postavljen)
  try {
    const matchStart = new Date(match.start_time);
    const minutesUntilStart = (matchStart - currentTime) / (1000 * 60);

    // Ako je match za više od 10 minuta i status nije finished/live, tretiramo kao upcoming
    if (
      minutesUntilStart > 10 &&
      !["finished", "ft", "live", "ht", "inprogress", "halftime"].includes(
        status
      )
    ) {
      return true;
    }
  } catch (error) {
    console.warn("Error calculating match start time:", error);
  }

  return false;
}

/**
 * Provjeri je li utakmica u određenom vremenskom rasponu
 */
function isMatchInTimeRange(match, timeFilter, referenceDate = new Date()) {
  try {
    const matchStart = new Date(match.start_time);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    const selectedDay = new Date(referenceDate);
    selectedDay.setHours(0, 0, 0, 0);
    const selectedDayEnd = new Date(
      selectedDay.getTime() + 24 * 60 * 60 * 1000
    );

    switch (timeFilter) {
      case "selected":
        return matchStart >= selectedDay && matchStart < selectedDayEnd;
      case "today":
        return matchStart >= today && matchStart < tomorrow;
      case "tomorrow":
        return (
          matchStart >= tomorrow &&
          matchStart < new Date(tomorrow.getTime() + 24 * 60 * 60 * 1000)
        );
      case "week":
        return matchStart >= today && matchStart <= nextWeek;
      case "next24h":
        const next24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        return matchStart >= now && matchStart <= next24h;
      case "all":
      default:
        return matchStart >= now; // Only future matches
    }
  } catch (error) {
    console.warn("Error filtering by time range:", error);
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

export function useUpcomingMatches(selectedDate, options = {}) {
  const {
    timeFilter = "selected", // selected, today, tomorrow, week, next24h, all
    priorityFilter = "all", // all, top, regional
    venueFilter = "all", // all, home, away, neutral
    autoRefresh = true,
  } = options;

  const userPreferences = useUserPreferences();

  // Koristimo useMatchesByDate za osnovu
  const { matches, loading, backgroundRefreshing, error, refetch } =
    useMatchesByDate(selectedDate, { enabled: !!selectedDate });

  // 🔧 STEP 1: Filtriraj upcoming matches s deduplication
  const upcomingMatches = useMemo(() => {
    if (!matches || matches.length === 0) return [];

    const currentTime = new Date();

    // Filtriraj upcoming matches
    const upcoming = matches.filter((match) =>
      isMatchUpcoming(match, currentTime)
    );

    // Ukloni duplikate
    const deduped = removeDuplicates(upcoming);

    if (import.meta.env.DEV) {
      console.log(
        `⏰ Upcoming matches: ${matches.length} total → ${upcoming.length} upcoming → ${deduped.length} after deduplication`
      );
    }

    return deduped;
  }, [matches]);

  // 🔧 STEP 2: Primijeni time filter
  const timeFilteredMatches = useMemo(() => {
    if (!upcomingMatches.length) return [];

    return upcomingMatches.filter((match) =>
      isMatchInTimeRange(match, timeFilter, selectedDate)
    );
  }, [upcomingMatches, timeFilter, selectedDate]);

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

  // 🔧 STEP 4: Primijeni venue filter (optional - može se koristiti za favorite teams)
  const venueFilteredMatches = useMemo(() => {
    if (!priorityFilteredMatches.length || venueFilter === "all") {
      return priorityFilteredMatches;
    }

    // Ovo možemo proširiti s logikom za home/away/neutral ako imamo podatke
    return priorityFilteredMatches;
  }, [priorityFilteredMatches, venueFilter]);

  // 🔧 STEP 5: Smart sorting (upcoming matches se sortiraju po vremenu)
  const sortedMatches = useMemo(() => {
    if (!venueFilteredMatches.length) return [];

    // Za upcoming matches, sortiramo chronologically (najranije prvo)
    const sorted = sortMatches(venueFilteredMatches, {
      prioritizeUserFavorites: userPreferences.sortingEnabled,
      favoriteTeams: userPreferences.favoriteTeams,
      favoriteLeagues: userPreferences.favoriteLeagues,
      currentTime: new Date(),
      debugMode: import.meta.env.DEV,
    });

    // Additional sorting for upcoming - chronological within same priority
    return sorted.sort((a, b) => {
      // Prvo po user favorites
      const aIsFavorite = isUserFavorite(
        a,
        userPreferences.favoriteTeams,
        userPreferences.favoriteLeagues
      );
      const bIsFavorite = isUserFavorite(
        b,
        userPreferences.favoriteTeams,
        userPreferences.favoriteLeagues
      );

      if (aIsFavorite !== bIsFavorite) {
        return bIsFavorite ? 1 : -1;
      }

      // Zatim po league priority
      const leagueDiff =
        getLeaguePriority(b.competition) - getLeaguePriority(a.competition);
      if (Math.abs(leagueDiff) > 5) return leagueDiff;

      // Konačno chronological - ranije utakmice prve
      return new Date(a.start_time) - new Date(b.start_time);
    });
  }, [venueFilteredMatches, userPreferences]);

  // 🔧 STEP 6: Generate statistics
  const stats = useMemo(() => {
    if (!upcomingMatches.length) return null;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    const next24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    return {
      selected: upcomingMatches.filter((m) =>
        isMatchInTimeRange(m, "selected", selectedDate)
      ).length,
      today: upcomingMatches.filter((m) => isMatchInTimeRange(m, "today"))
        .length,
      tomorrow: upcomingMatches.filter((m) => isMatchInTimeRange(m, "tomorrow"))
        .length,
      next24h: upcomingMatches.filter((m) => isMatchInTimeRange(m, "next24h"))
        .length,
      thisWeek: upcomingMatches.filter((m) => isMatchInTimeRange(m, "week"))
        .length,
      topLeagues: upcomingMatches.filter(
        (m) => getLeaguePriority(m.competition) >= 80
      ).length,
      favorites: upcomingMatches.filter((m) =>
        isUserFavorite(
          m,
          userPreferences.favoriteTeams,
          userPreferences.favoriteLeagues
        )
      ).length,
    };
  }, [upcomingMatches, selectedDate, userPreferences]);

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

  // Imminent matches (starting in next 2 hours)
  const imminentMatches = useMemo(() => {
    const now = new Date();
    const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    return sortedMatches.filter((match) => {
      const matchStart = new Date(match.start_time);
      return matchStart >= now && matchStart <= twoHoursFromNow;
    });
  }, [sortedMatches]);

  // Auto-refresh every 2 minutes (upcoming matches can change more often than finished)
  useAutoRefresh(
    matches,
    refetch,
    30000, // 30s for live (not applicable here but keeping consistent)
    120000 // 2min for idle/upcoming
  );

  return {
    // Raw data
    matches: sortedMatches,
    allUpcomingMatches: upcomingMatches,
    imminentMatches,

    // Loading states
    loading,
    backgroundRefreshing,
    error,

    // Statistics
    stats,
    topLeaguesCount,
    favoritesCount,
    totalCount: sortedMatches.length,
    imminentCount: imminentMatches.length,

    // Actions
    refetch,

    // Debug info
    debugInfo: import.meta.env.DEV
      ? {
          totalMatches: matches?.length || 0,
          upcomingMatches: upcomingMatches.length,
          timeFiltered: timeFilteredMatches.length,
          priorityFiltered: priorityFilteredMatches.length,
          venueFiltered: venueFilteredMatches.length,
          finalSorted: sortedMatches.length,
        }
      : null,
  };
}
