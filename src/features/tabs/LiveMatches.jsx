// src/features/tabs/LiveMatches.jsx - FIXED VERSION WITH TIME SORT BUTTON
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
import TimeSortButton, { applyTimeSort } from "../../ui/TimeSortButton";

export default function LiveMatches() {
  const [, setCurrentTime] = useState(new Date());
  const [groupByCompetition, setGroupByCompetition] = useState(true);
  const [timeSortType, setTimeSortType] = useState("smart");

  // 🚀 NOVO: Prati prethodnji broj za force refresh
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
    fetchLiveMatches, // još uvijek postoji, ali koristi refreshNow za ručni klik
  } = useLiveMatches();

  // 🚀 NOVO: Force refresh ako se broj drastično promijeni
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

  // 🔧 FIXED: Proper sorting with time sort integration
  const sortedMatches = useMemo(() => {
    const input = Array.isArray(matches) ? matches : [];
    if (input.length === 0) return [];

    const smartSorted = sortMatches(input, {
      prioritizeUserFavorites: userPreferences.sortingEnabled,
      favoriteTeams: userPreferences.favoriteTeams,
      favoriteLeagues: userPreferences.favoriteLeagues,
      currentTime: new Date(),
      debugMode: import.meta.env.DEV,
    });

    // Then apply time sorting
    const finalSorted = applyTimeSort(smartSorted, timeSortType);
    return finalSorted;
  }, [matches, userPreferences, timeSortType]);

  const groupedMatches = useMemo(() => {
    if (!groupByCompetition) return null;
    return groupMatchesByCompetition(sortedMatches);
  }, [sortedMatches, groupByCompetition]);

  const topLeaguesCount = sortedMatches.filter(
    (match) => getLeaguePriority(match.competition) > 80
  ).length;

  const favoritesCount = sortedMatches.filter(
    (match) =>
      userPreferences.favoriteTeams.some(
        (team) =>
          team.toLowerCase() === match.home_team?.toLowerCase() ||
          team.toLowerCase() === match.away_team?.toLowerCase()
      ) ||
      userPreferences.favoriteLeagues.some(
        (league) => league.toLowerCase() === match.competition?.toLowerCase()
      )
  ).length;

  useEffect(() => {
    if ((matches?.length ?? 0) > 0) {
      const interval = setInterval(() => {
        setCurrentTime(new Date());
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [matches?.length]);

  if (loading) {
    return <LoadingState message="Loading live matches..." />;
  }

  if (error) {
    return <ErrorState error={error} onRetry={() => fetchLiveMatches(false)} />;
  }

  if (!Array.isArray(matches) || matches.length === 0) {
    return <EmptyLiveMatches onRefresh={() => fetchLiveMatches(false)} />;
  }

  return (
    <div className="min-h-screen bg-muted rounded-3xl p-1">
      <LiveMatchesHeader
        matchCount={matches.length}
        backgroundRefreshing={backgroundRefreshing}
      />

      {/* 🔧 ENHANCED: Stats row with Time Sort Button */}
      <div className="text-center mb-4 space-y-3">
        <p className="text-muted-foreground text-sm">
          Live football matches happening right now
        </p>

        {/* Stats and controls row */}
        <div className="flex justify-center items-center gap-3 flex-wrap text-xs">
          {topLeaguesCount > 0 && (
            <span className="bg-blue-600 text-white px-2 py-1 rounded-full">
              ⭐ {topLeaguesCount} Top League{topLeaguesCount === 1 ? "" : "s"}
            </span>
          )}

          {favoritesCount > 0 && (
            <span className="bg-green-600 text-white px-2 py-1 rounded-full">
              ❤️ {favoritesCount} Favorite{favoritesCount === 1 ? "" : "s"}
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

      <MatchesGrid
        groupByCompetition={groupByCompetition}
        groupedMatches={groupedMatches}
        sortedMatches={sortedMatches}
        showLiveIndicator={false}
      />

      {/* Manual refresh and controls */}
      <div className="flex justify-center items-center gap-3 mt-8 mb-4">
        <button
          onClick={() => fetchLiveMatches(false)}
          disabled={backgroundRefreshing}
          className={`px-6 py-3 rounded-xl font-medium transition-all duration-200 flex items-center gap-2 ${
            backgroundRefreshing
              ? "bg-gray-600 text-gray-300 cursor-not-allowed"
              : "bg-red-600 text-white hover:bg-red-700 hover:scale-105 active:scale-95"
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
