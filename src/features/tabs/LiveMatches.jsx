// src/features/tabs/LiveMatches.jsx - REDESIGNED WITH MODERN STYLING
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
import EmptyLiveMatches from "../../features/live_matches/EmptyLiveMatches";
import LoadingState from "../../ui/LoadingState";
import ErrorState from "../../ui/ErrorState";

import { RefreshButton } from "../../ui/SpecializedButtons";
import GroupButton from "../../ui/GroupButton";
import TimeSortButton, { applyTimeSort } from "../../ui/TimeSortButton";

export default function LiveMatches() {
  const [, setCurrentTime] = useState(new Date());
  const [groupByCompetition, setGroupByCompetition] = useState(true);
  const [timeSortType, setTimeSortType] = useState("smart");
  const [isLoaded, setIsLoaded] = useState(false);

  const prevCountRef = useRef(0);
  const lastForceRef = useRef(0);
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

  // Animation trigger
  useEffect(() => {
    setIsLoaded(true);
  }, []);

  // Force refresh logic
  useEffect(() => {
    const currentCount = matches?.length ?? 0;
    const prevCount = prevCountRef.current;
    const now = Date.now();

    // Reduce sensitivity: only force-refresh on large changes and throttle
    const diff = Math.abs(currentCount - prevCount);
    const minDiffThreshold = 10; // require a noticeable change
    const throttleMs = 30 * 1000; // don't force-refresh more often than every 30s

    if (
      prevCount > 0 &&
      diff >= minDiffThreshold &&
      now - lastForceRef.current > throttleMs &&
      !backgroundRefreshing &&
      !loading
    ) {
      console.log(
        `🚨 [FORCE REFRESH] Count changed: ${prevCount} → ${currentCount} (diff=${diff}), triggering background fetch`
      );
      lastForceRef.current = now;
      setTimeout(() => {
        fetchLiveMatches(true);
      }, 1000);
    }

    prevCountRef.current = currentCount;
  }, [matches?.length, fetchLiveMatches, backgroundRefreshing, loading]);

  // Sorting with time sort integration
  const sortedMatches = useMemo(() => {
    const input = Array.isArray(matches) ? matches : [];

    if (timeSortType === "smart") {
      return sortMatches(input, userPreferences);
    }

    // For explicit time sorts, honor chronological ordering.
    // We still remove duplicates via sortMatches' dedupe helper by
    // calling removeDuplicateMatches indirectly, but keep time ordering.
    const timeSorted = applyTimeSort(input, timeSortType);
    return timeSorted;
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

  // Update current time every minute
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  // Enhanced loading state
  if (loading && (!matches || matches.length === 0)) {
    return (
      <div className="relative min-h-[600px]">
        <div className="flex justify-center items-center min-h-[400px]">
          <div className="text-center">
            <div className="relative mb-6">
              <div className="animate-spin w-16 h-16 border-4 border-red-500/30 border-t-red-500 rounded-full mx-auto"></div>
              <div className="absolute inset-0 animate-ping w-16 h-16 border-4 border-red-500/20 rounded-full mx-auto opacity-20"></div>
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">
              Loading Live Matches
            </h3>
            <p className="text-gray-300">
              Searching for matches in progress...
            </p>
            <div className="mt-4 flex justify-center items-center gap-2 text-sm text-gray-400">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
              Real-time updates enabled
            </div>
          </div>
        </div>
      </div>
    );
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
    <div className="relative">
      {/* Enhanced Header */}
      <div
        className={`transition-all duration-700 ${
          isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        }`}
      >
        <LiveMatchesHeader
          matchCount={sortedMatches.length}
          backgroundRefreshing={backgroundRefreshing}
          lastRefreshed={lastRefreshed}
          isRealtimeActive={isRealtimeActive}
        />
      </div>

      {/* Enhanced Stats */}
      <div
        className={`transition-all duration-700 delay-200 ${
          isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        }`}
      >
        <LiveMatchesStats
          total={sortedMatches.length}
          topLeagues={topLeaguesCount}
          favorites={favoritesCount}
          backgroundRefreshing={backgroundRefreshing}
        />
      </div>

      {/* Enhanced Controls */}
      <div
        className={`flex justify-center items-center gap-4 mb-6 transition-all duration-700 delay-300 ${
          isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        }`}
      >
        <GroupButton
          isGrouped={groupByCompetition}
          onToggle={() => setGroupByCompetition(!groupByCompetition)}
          size="sm"
          variant="modern"
          className="bg-gradient-to-r from-gray-700/80 to-gray-800/80 backdrop-blur-sm border-gray-600/30 hover:from-red-600/80 hover:to-red-700/80 hover:border-red-500/40"
        />

        <TimeSortButton
          value={timeSortType}
          onChange={setTimeSortType}
          size="sm"
          variant="modern"
          className="rounded-full bg-gradient-to-r from-gray-700/80 to-gray-800/80 backdrop-blur-sm border-gray-600/30 hover:from-blue-600/80 hover:to-blue-700/80 hover:border-blue-500/40"
        />
      </div>

      {/* Sort indicator */}
      {timeSortType !== "smart" && (
        <div
          className={`text-center text-sm text-gray-400 mb-4 transition-all duration-700 delay-400 ${
            isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
        >
          Sorted by:{" "}
          {timeSortType === "chronological" ? "Earliest first" : "Latest first"}
        </div>
      )}

      {/* Matches Grid */}
      <div
        className={`transition-all duration-700 delay-500 ${
          isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        }`}
      >
        <MatchesGrid
          groupByCompetition={groupByCompetition}
          groupedMatches={groupedMatches}
          sortedMatches={sortedMatches}
          showLiveIndicator={true}
        />
      </div>

      {/* Enhanced Manual refresh controls */}
      <div
        className={`flex justify-center items-center gap-4 mt-8 mb-4 transition-all duration-700 delay-600 ${
          isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        }`}
      >
        <RefreshButton
          isLoading={backgroundRefreshing}
          onClick={() => fetchLiveMatches(false)}
          size="lg"
          className="group relative overflow-hidden bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-bold px-8 py-4 rounded-xl shadow-lg hover:shadow-2xl hover:shadow-red-500/40 transition-all duration-300 hover:scale-105"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <span className="relative z-10 flex items-center gap-2">
            <span className={`${backgroundRefreshing ? "animate-spin" : ""}`}>
              🔄
            </span>
            {backgroundRefreshing ? "Refreshing..." : "Manual Refresh"}
          </span>
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
          className="md:hidden group rounded-full relative overflow-hidden bg-gradient-to-r from-gray-700 to-gray-800 hover:from-gray-600 hover:to-gray-700 text-white px-4 py-2 border border-gray-600 hover:border-gray-500 transition-all duration-300 hover:scale-105 shadow-lg"
          title="Cycle sort type"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <span className="relative z-10">
            {timeSortType === "smart"
              ? "🤖"
              : timeSortType === "chronological"
              ? "⏰→"
              : "⏰←"}
          </span>
        </button>
      </div>

      {/* Real-time status indicator */}
      <div
        className={`flex justify-center mt-4 transition-all duration-700 delay-700 ${
          isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        }`}
      >
        <div className="bg-gradient-to-r from-green-600/20 via-green-500/30 to-green-600/20 backdrop-blur-sm border border-green-500/30 text-green-300 px-4 py-2 rounded-xl text-sm flex items-center gap-2">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
          Live updates every 30 seconds
          {isRealtimeActive && (
            <span className="text-xs opacity-75">• Active</span>
          )}
        </div>
      </div>
    </div>
  );
}
