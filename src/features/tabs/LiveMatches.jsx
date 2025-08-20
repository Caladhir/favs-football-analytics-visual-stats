// src/features/tabs/LiveMatches.jsx - KONAČNO ISPRAVLJEN IMPORT
import React, { useState, useEffect, useMemo, useRef } from "react";
import { useLiveMatches } from "../../hooks/useLiveMatches";
import {
  sortMatches,
  groupMatchesByCompetition,
  useUserPreferences,
  getLeaguePriority,
} from "../../utils/matchSortingUtils";

import LiveMatchesHeader from "../../features/live_matches/LiveMatchesHeader";
import LiveMatchesStats from "../../features/live_matches/LiveMatchesStats";
import MatchesGrid from "../../ui/MatchesGrid";
import LiveMatchesDebug from "../../features/live_matches/LiveMatchesDebug";
import EmptyLiveMatches from "../../features/live_matches/EmptyLiveMatches";
import LoadingState from "../../ui/LoadingState";
import ErrorState from "../../ui/ErrorState";

// ISPRAVLJEN IMPORT - koristi default import za GroupButton
import { RefreshButton } from "../../ui/SpecializedButtons";
import GroupButton from "../../ui/GroupButton"; // DEFAULT IMPORT!
import TimeSortButton, { applyTimeSort } from "../../ui/TimeSortButton"; // DEFAULT + NAMED

export default function LiveMatches() {
  const [, setCurrentTime] = useState(new Date());
  const [groupByCompetition, setGroupByCompetition] = useState(true);
  const [timeSortType, setTimeSortType] = useState("smart");

  // Prati prethodnji broj za force refresh
  const prevCountRef = useRef(0);

  const userPreferences = useUserPreferences();

  const {
    matches,
    loading,
    backgroundRefreshing,
    error,
    lastRefreshed,
    isRealtimeActive,
    refreshNow,
    fetchLiveMatches,
  } = useLiveMatches();

  // Force refresh ako se broj drastično promijeni
  useEffect(() => {
    const currentCount = matches?.length ?? 0;
    const prevCount = prevCountRef.current;

    if (prevCount > 0 && Math.abs(currentCount - prevCount) >= 2) {
      console.log(
        `🚨 [FORCE REFRESH] Count changed: ${prevCount} → ${currentCount}`
      );
      setTimeout(() => {
        fetchLiveMatches(true);
      }, 1000);
    }

    prevCountRef.current = currentCount;
  }, [matches?.length, fetchLiveMatches]);

  // Proper sorting with time sort integration
  const sortedMatches = useMemo(() => {
    const input = Array.isArray(matches) ? matches : [];

    if (timeSortType === "smart") {
      // Use existing smart sorting
      return sortMatches(input, userPreferences);
    } else {
      // Apply time sorting first, then smart sort within time groups
      const timeSorted = applyTimeSort(input, timeSortType);
      return sortMatches(timeSorted, userPreferences);
    }
  }, [matches, timeSortType, userPreferences]);

  // Group matches if needed
  const groupedMatches = useMemo(() => {
    return groupByCompetition && sortedMatches.length > 0
      ? groupMatchesByCompetition(sortedMatches)
      : null;
  }, [sortedMatches, groupByCompetition]);

  // Stats calculations
  const topLeaguesCount = useMemo(() => {
    return sortedMatches.filter(
      (match) => getLeaguePriority(match.competition) <= 5
    ).length;
  }, [sortedMatches]);

  const favoritesCount = useMemo(() => {
    return sortedMatches.filter(
      (match) =>
        userPreferences.favoriteTeams.includes(match.home_team) ||
        userPreferences.favoriteTeams.includes(match.away_team)
    ).length;
  }, [sortedMatches, userPreferences.favoriteTeams]);

  // Update current time every minute for live updates
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  // Loading state
  if (loading && (!matches || matches.length === 0)) {
    return <LoadingState message="Loading live matches..." />;
  }

  // Error state
  if (error) {
    return (
      <ErrorState
        title="Failed to load live matches"
        message={error}
        onRetry={() => fetchLiveMatches(false)}
      />
    );
  }

  // Empty state
  if (!loading && (!matches || matches.length === 0)) {
    return <EmptyLiveMatches onRefresh={() => fetchLiveMatches(false)} />;
  }

  return (
    <div className="min-h-screen bg-muted rounded-3xl p-1">
      {/* Header */}
      <LiveMatchesHeader
        matchCount={sortedMatches.length}
        backgroundRefreshing={backgroundRefreshing}
        lastRefreshed={lastRefreshed}
        isRealtimeActive={isRealtimeActive}
      />

      {/* Stats */}
      <LiveMatchesStats
        total={sortedMatches.length}
        topLeagues={topLeaguesCount}
        favorites={favoritesCount}
      />

      {/* Controls */}
      <div className="flex justify-center items-center gap-4 mb-6">
        {/* Group toggle button */}
        <GroupButton
          isGrouped={groupByCompetition}
          onToggle={() => setGroupByCompetition(!groupByCompetition)}
          size="sm"
          variant="minimal"
          groupedText=" Grouped"
          ungroupedText=" Group"
        />

        {/* Time Sort Button */}
        <TimeSortButton
          value={timeSortType}
          onChange={setTimeSortType}
          size="sm"
          variant="minimal"
        />
      </div>

      {/* Sort type indicator */}
      {timeSortType !== "smart" && (
        <div className="text-center text-xs text-gray-400 mb-4">
          Sorted by:{" "}
          {timeSortType === "chronological" ? "Earliest first" : "Latest first"}
        </div>
      )}

      {/* Matches Grid */}
      <MatchesGrid
        groupByCompetition={groupByCompetition}
        groupedMatches={groupedMatches}
        sortedMatches={sortedMatches}
        showLiveIndicator={true}
      />

      {/* Manual refresh and controls */}
      <div className="flex justify-center items-center gap-3 mt-8 mb-4">
        <RefreshButton
          isLoading={backgroundRefreshing}
          onClick={() => fetchLiveMatches(false)}
          size="lg"
        >
          {backgroundRefreshing ? "Refreshing..." : "Manual Refresh"}
        </RefreshButton>

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
          className="md:hidden px-4 py-2 bg-gray-800/80 text-white rounded-lg border border-gray-600 hover:bg-gray-700/80 transition-colors"
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
      <LiveMatchesDebug
        matches={matches}
        sortedMatches={sortedMatches}
        topLeaguesCount={topLeaguesCount}
        favoritesCount={favoritesCount}
        groupByCompetition={groupByCompetition}
        backgroundRefreshing={backgroundRefreshing}
      />
    </div>
  );
}
