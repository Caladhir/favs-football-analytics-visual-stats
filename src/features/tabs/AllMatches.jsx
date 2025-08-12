// src/features/tabs/AllMatches.jsx - WITH TIME SORT BUTTON
import React, { useState, useMemo } from "react";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";
import { useAllMatches } from "../../hooks/useAllMatches";
import {
  sortMatches,
  groupMatchesByCompetition,
  useUserPreferences,
  getLeaguePriority,
  isUserFavorite,
} from "../../utils/matchSortingUtils";
import { getValidLiveMatches } from "../../utils/matchStatusUtils";

// Components
import AllMatchesHeader from "../../features/all_matches/AllMatchesHeader";
import MatchesGrid from "../../ui/MatchesGrid";
import AllMatchesDebug from "../../features/all_matches/AllMatchesDebug";
import EmptyAllMatches from "../../features/all_matches/EmptyAllMatches";
import LoadingState from "../../ui/LoadingState";
import ErrorState from "../../ui/ErrorState";
import TimeSortButton, { applyTimeSort } from "../../ui/TimeSortButton";

/**
 * Ukloni duplikate iz lista utakmica
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

  const duplicatesRemoved = matches.length - deduped.length;
  if (duplicatesRemoved > 0 && import.meta.env.DEV) {
    console.log(
      `🔧 AllMatches: Removed ${duplicatesRemoved} duplicate matches`
    );
  }

  return deduped;
}

export default function AllMatches() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [groupByCompetition, setGroupByCompetition] = useState(false);
  const [timeSortType, setTimeSortType] = useState("smart"); // 🆕 NEW

  // Custom hooks
  const userPreferences = useUserPreferences();
  const { matches, loading, backgroundRefreshing, handleAutoRefresh, error } =
    useAllMatches(selectedDate);

  // 🔧 STEP 1: Remove duplicates first
  const dedupedMatches = useMemo(() => {
    if (!matches || matches.length === 0) return [];
    return removeDuplicates(matches);
  }, [matches]);

  // 🔧 STEP 2: Smart sorting with time sort integration
  const sortedMatches = useMemo(() => {
    if (!dedupedMatches || dedupedMatches.length === 0) return [];

    // First apply smart sorting
    const smartSorted = sortMatches(dedupedMatches, {
      prioritizeUserFavorites: userPreferences.sortingEnabled,
      favoriteTeams: userPreferences.favoriteTeams,
      favoriteLeagues: userPreferences.favoriteLeagues,
      currentTime: new Date(),
      debugMode: import.meta.env.DEV,
    });

    // Then apply time sorting
    const finalSorted = applyTimeSort(smartSorted, timeSortType);
    return finalSorted;
  }, [dedupedMatches, userPreferences, timeSortType]); // 🆕 Added timeSortType

  // 🔧 STEP 3: Group by competition if enabled
  const groupedMatches = useMemo(() => {
    if (!groupByCompetition || !sortedMatches.length) return null;
    return groupMatchesByCompetition(sortedMatches);
  }, [sortedMatches, groupByCompetition]);

  // 🔧 STEP 4: Calculate statistics
  const stats = useMemo(() => {
    if (!sortedMatches.length) return null;

    const liveMatches = getValidLiveMatches(sortedMatches);
    const upcomingMatches = sortedMatches.filter((m) =>
      ["upcoming", "notstarted", "scheduled"].includes(m.status?.toLowerCase())
    );
    const finishedMatches = sortedMatches.filter((m) =>
      [
        "finished",
        "ft",
        "full_time",
        "ended",
        "afterextra",
        "penalties",
      ].includes(m.status?.toLowerCase())
    );
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

    return {
      total: sortedMatches.length,
      live: liveMatches.length,
      upcoming: upcomingMatches.length,
      finished: finishedMatches.length,
      topLeagues: topLeaguesCount,
      favorites: favoritesCount,
    };
  }, [sortedMatches, userPreferences]);

  // Auto-refresh kada ima live utakmica
  useAutoRefresh(matches, handleAutoRefresh, 30000);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-muted rounded-3xl p-1">
        <div className="flex justify-center my-4">
          <div className="bg-primary text-white px-4 py-2 rounded-full text-sm font-medium">
            📅 All Matches
          </div>
        </div>
        <LoadingState />
      </div>
    );
  }

  // Error state
  if (error) {
    return <ErrorState error={error} onRetry={handleAutoRefresh} />;
  }

  // Empty state
  if (matches.length === 0) {
    return (
      <EmptyAllMatches
        selectedDate={selectedDate}
        setSelectedDate={setSelectedDate}
        onRefresh={handleAutoRefresh}
      />
    );
  }

  // Main render
  return (
    <div className="min-h-screen bg-muted rounded-3xl p-1">
      {/* Header with calendar */}
      <AllMatchesHeader
        selectedDate={selectedDate}
        setSelectedDate={setSelectedDate}
        stats={stats}
        backgroundRefreshing={backgroundRefreshing}
        groupByCompetition={groupByCompetition}
        setGroupByCompetition={setGroupByCompetition}
      />

      {/* 🆕 NEW: Enhanced controls with TimeSortButton */}
      <div className="text-center mb-4 space-y-3">
        {stats && (
          <div className="flex justify-center items-center gap-3 flex-wrap text-xs">
            {/* Live indicator */}
            {stats.live > 0 && (
              <span className="bg-red-600 text-white px-2 py-1 rounded-full animate-pulse">
                🔴 {stats.live} Live
              </span>
            )}

            {/* Upcoming */}
            {stats.upcoming > 0 && (
              <span className="bg-blue-600 text-white px-2 py-1 rounded-full">
                ⏰ {stats.upcoming} Upcoming
              </span>
            )}

            {/* Finished */}
            {stats.finished > 0 && (
              <span className="bg-green-600 text-white px-2 py-1 rounded-full">
                ✅ {stats.finished} Finished
              </span>
            )}

            {/* Top leagues */}
            {stats.topLeagues > 0 && (
              <span className="bg-yellow-600 text-white px-2 py-1 rounded-full">
                ⭐ {stats.topLeagues} Top
              </span>
            )}

            {/* Favorites */}
            {stats.favorites > 0 && (
              <span className="bg-purple-600 text-white px-2 py-1 rounded-full">
                ❤️ {stats.favorites} Favorites
              </span>
            )}

            {/* Group toggle */}
            <button
              onClick={() => setGroupByCompetition(!groupByCompetition)}
              className={`
                px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200
                ${
                  groupByCompetition
                    ? "bg-green-600 text-white"
                    : "bg-gray-600 text-white"
                }
                hover:scale-105 active:scale-95
              `}
            >
              {groupByCompetition ? "📋 Grouped" : "📝 Group"}
            </button>

            {/* 🆕 NEW: Time Sort Button */}
            <TimeSortButton
              value={timeSortType}
              onChange={setTimeSortType}
              size="sm"
              variant="minimal"
            />
          </div>
        )}

        {/* Sort type indicator */}
        {timeSortType !== "smart" && (
          <div className="text-xs text-muted-foreground">
            Sorted by:{" "}
            {timeSortType === "chronological"
              ? "Earliest first"
              : "Latest first"}
          </div>
        )}
      </div>

      {/* Matches grid */}
      <MatchesGrid
        groupByCompetition={groupByCompetition}
        groupedMatches={groupedMatches}
        sortedMatches={sortedMatches}
        showLiveIndicator={true}
      />

      {/* Manual refresh button */}
      <div className="flex justify-center items-center gap-3 mt-8 mb-4">
        <button
          onClick={handleAutoRefresh}
          disabled={backgroundRefreshing}
          className={`px-6 py-3 rounded-xl font-medium transition-all duration-200 flex items-center gap-2 ${
            backgroundRefreshing
              ? "bg-gray-600 text-gray-300 cursor-not-allowed"
              : "bg-primary text-white hover:bg-primary/80 hover:scale-105 active:scale-95"
          }`}
        >
          <span className={`${backgroundRefreshing ? "animate-spin" : ""}`}>
            🔄
          </span>
          {backgroundRefreshing ? "Refreshing..." : "Manual Refresh"}
        </button>

        {/* Quick sort toggle for mobile */}
        <button
          onClick={() => {
            const nextSort =
              timeSortType === "smart"
                ? "chronological"
                : timeSortType === "chronological"
                ? "reverse-chronological"
                : "smart";
            setTimeSortType(nextSort);
          }}
          className="md:hidden px-4 py-2 bg-muted text-foreground rounded-lg border border-border hover:bg-muted/80 transition-colors"
          title="Cycle sort type"
        >
          {timeSortType === "smart"
            ? "🤖"
            : timeSortType === "chronological"
            ? "⏰↑"
            : "⏰↓"}
        </button>
      </div>

      {/* Debug info */}
      <AllMatchesDebug
        matches={matches}
        sortedMatches={sortedMatches}
        userPreferences={userPreferences}
        backgroundRefreshing={backgroundRefreshing}
        stats={stats}
      />
    </div>
  );
}
