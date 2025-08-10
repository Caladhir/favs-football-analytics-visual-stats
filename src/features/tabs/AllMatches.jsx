// src/features/tabs/AllMatches.jsx - BEZ LIVE COUNT PROP
import React, { useState, useMemo } from "react";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";
import { useAllMatches } from "../../hooks/useAllMatches";
import {
  sortMatches,
  groupMatchesByCompetition,
  useUserPreferences,
} from "../../utils/matchSortingUtils";
import { getValidLiveMatches } from "../../utils/matchStatusUtils";

// Komponente
import AllMatchesHeader from "../../features/all_matches/AllMatchesHeader";
import AllMatchesControls from "../../features/all_matches/AllMatchesControls";
import MatchesGrid from "../../ui/MatchesGrid";
import AllMatchesDebug from "../../features/all_matches/AllMatchesDebug";
import EmptyAllMatches from "../../features/all_matches/EmptyAllMatches";
import LoadingState from "../../ui/LoadingState";

export default function AllMatches() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [groupByCompetition, setGroupByCompetition] = useState(false);

  // Custom hooks
  const userPreferences = useUserPreferences();
  const { matches, loading, backgroundRefreshing, handleAutoRefresh } =
    useAllMatches(selectedDate);

  // 🚀 Smart sorting
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
  const liveMatchesCount = getValidLiveMatches(matches).length; // Zadržano za debug
  const topLeaguesCount = sortedMatches.filter((match) =>
    [
      "Premier League",
      "La Liga",
      "Serie A",
      "Bundesliga",
      "Ligue 1",
      "UEFA Champions League",
    ].includes(match.competition)
  ).length;

  // Auto-refresh (svakih 30 sekundi kad ima live utakmica)
  useAutoRefresh(matches, handleAutoRefresh, 30000);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-muted rounded-3xl p-1">
        <AllMatchesHeader
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
        />
        <LoadingState message="Loading matches..." />
      </div>
    );
  }

  // Empty state
  if (matches.length === 0) {
    return (
      <EmptyAllMatches
        selectedDate={selectedDate}
        setSelectedDate={setSelectedDate}
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
      />

      {/* 🔧 AŽURIRANO: Controls row bez liveMatchesCount */}
      <AllMatchesControls
        topLeaguesCount={topLeaguesCount}
        groupByCompetition={groupByCompetition}
        setGroupByCompetition={setGroupByCompetition}
      />

      {/* Matches grid */}
      <MatchesGrid
        groupByCompetition={groupByCompetition}
        groupedMatches={groupedMatches}
        sortedMatches={sortedMatches}
        showLiveIndicator={true}
      />

      {/* Debug info - zadržava liveMatchesCount za development */}
      <AllMatchesDebug
        matches={matches}
        sortedMatches={sortedMatches}
        userPreferences={userPreferences}
        backgroundRefreshing={backgroundRefreshing}
        liveMatchesCount={liveMatchesCount} // Dodano za debug
      />
    </div>
  );
}
