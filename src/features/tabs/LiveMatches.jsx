// src/features/tabs/LiveMatches.jsx
import React, { useState, useEffect, useMemo } from "react";
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

export default function LiveMatches() {
  const [, setCurrentTime] = useState(new Date());
  const [groupByCompetition, setGroupByCompetition] = useState(true);

  const userPreferences = useUserPreferences();

  const { matches, loading, backgroundRefreshing, error, fetchLiveMatches } =
    useLiveMatches(false);

  React.useEffect(() => {
    fetchLiveMatches(false);
  }, [fetchLiveMatches]);

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
    if (matches.length > 0) {
      const interval = setInterval(() => {
        setCurrentTime(new Date());
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [matches.length]);

  if (loading) {
    return <LoadingState message="Loading live matches..." />;
  }

  if (error) {
    return <ErrorState error={error} onRetry={() => fetchLiveMatches(false)} />;
  }

  if (matches.length === 0) {
    return <EmptyLiveMatches onRefresh={() => fetchLiveMatches(false)} />;
  }

  return (
    <div className="min-h-screen bg-muted rounded-3xl p-1">
      <LiveMatchesHeader
        matchCount={matches.length}
        backgroundRefreshing={backgroundRefreshing}
      />

      <LiveMatchesStats
        topLeaguesCount={topLeaguesCount}
        favoritesCount={favoritesCount}
        groupByCompetition={groupByCompetition}
        setGroupByCompetition={setGroupByCompetition}
      />

      <MatchesGrid
        groupByCompetition={groupByCompetition}
        groupedMatches={groupedMatches}
        sortedMatches={sortedMatches}
        showLiveIndicator={false}
      />

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
