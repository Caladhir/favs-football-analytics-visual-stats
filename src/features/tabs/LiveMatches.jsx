// src/features/tabs/LiveMatches.jsx - REFAKTORIRANA KRATKA VERZIJA
import React, { useState, useEffect, useMemo } from "react";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";
import { useLiveMatches } from "../../hooks/useLiveMatches";
import {
  sortMatches,
  groupMatchesByCompetition,
  useUserPreferences,
  getLeaguePriority,
} from "../../utils/matchSortingUtils";

// Komponente
import LiveMatchesHeader from "../../features/live_matches/LiveMatchesHeader";
import LiveMatchesStats from "../../features/live_matches/LiveMatchesStats";
import MatchesGrid from "../../ui/MatchesGrid";
import LiveMatchesGrid from "../../features/live_matches/LiveMatchesGrid";
import LiveMatchesDebug from "../../features/live_matches/LiveMatchesDebug";
import EmptyLiveMatches from "../../features/live_matches/EmptyLiveMatches";

import LoadingState from "../../ui/LoadingState";
import ErrorState from "../../ui/ErrorState";

export default function LiveMatches() {
  const [, setCurrentTime] = useState(new Date());
  const [groupByCompetition, setGroupByCompetition] = useState(true);

  // Custom hooks
  const userPreferences = useUserPreferences();
  const { matches, loading, backgroundRefreshing, error, fetchLiveMatches } =
    useLiveMatches();

  // 🚀 Smart sorting za live utakmice
  const sortedMatches = useMemo(() => {
    if (!matches || matches.length === 0) return [];

    return sortMatches(matches, {
      prioritizeUserFavorites: userPreferences.sortingEnabled,
      favoriteTeams: userPreferences.favoriteTeams,
      favoriteLeagues: userPreferences.favoriteLeagues,
      currentTime: new Date(),
      debugMode: import.meta.env.DEV,
    });
  }, [matches, userPreferences]);

  // 🚀 Grouped matches by competition
  const groupedMatches = useMemo(() => {
    if (!groupByCompetition) return null;
    return groupMatchesByCompetition(sortedMatches);
  }, [sortedMatches, groupByCompetition]);

  // Statistics for display
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

  // Inicijalno dohvaćanje
  React.useEffect(() => {
    fetchLiveMatches(false);
  }, [fetchLiveMatches]);

  // Auto-refresh (svakih 30 sekundi kad ima live utakmica)
  useAutoRefresh(matches, () => fetchLiveMatches(true), 30000);

  // UI timer za live minute (svaku sekundu)
  useEffect(() => {
    if (matches.length > 0) {
      console.log(
        `🔴 Live Matches Tab: ${matches.length} live matches - starting UI timer`
      );

      const interval = setInterval(() => {
        setCurrentTime(new Date());
      }, 1000);

      return () => clearInterval(interval);
    } else {
      console.log("✅ Live Matches Tab: No live matches - stopping UI timer");
    }
  }, [matches]);

  // Loading state
  if (loading) {
    return <LoadingState message="Loading live matches..." />;
  }

  // Error state
  if (error) {
    return <ErrorState error={error} onRetry={() => fetchLiveMatches(false)} />;
  }

  // Empty state
  if (matches.length === 0) {
    return <EmptyLiveMatches onRefresh={() => fetchLiveMatches(false)} />;
  }

  // Main render with live matches
  return (
    <div className="min-h-screen bg-muted rounded-3xl p-1">
      {/* Header */}
      <LiveMatchesHeader
        matchCount={matches.length}
        backgroundRefreshing={backgroundRefreshing}
      />

      {/* Stats and controls */}
      <LiveMatchesStats
        topLeaguesCount={topLeaguesCount}
        favoritesCount={favoritesCount}
        groupByCompetition={groupByCompetition}
        setGroupByCompetition={setGroupByCompetition}
      />

      {/* Matches grid */}
      <MatchesGrid
        groupByCompetition={groupByCompetition}
        groupedMatches={groupedMatches}
        sortedMatches={sortedMatches}
        showLiveIndicator={false} // Ne trebaš LIVE indicator jer su sve live
      />

      {/* Manual refresh button */}
      <div className="flex justify-center mt-8">
        <button
          onClick={() => fetchLiveMatches(false)}
          disabled={backgroundRefreshing}
          className={`px-6 py-2 rounded-lg font-medium transition-colors ${
            backgroundRefreshing
              ? "bg-gray-600 text-gray-300 cursor-not-allowed"
              : "bg-blue-600 text-white hover:bg-blue-700"
          }`}
        >
          {backgroundRefreshing ? "🔄 Refreshing..." : "🔄 Manual Refresh"}
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
