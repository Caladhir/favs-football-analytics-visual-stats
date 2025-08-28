// src/features/tabs/FinishedMatches.jsx - POPRAVLJENA STRUKTURA (kao UpcomingMatches)
import React, { useState, useEffect } from "react";
import { useFinishedMatches } from "../../hooks/useFinishedMatches";
import { groupMatchesByCompetition } from "../../utils/matchSortingUtils";

// Components
import FinishedMatchesHeader from "../../features/finished_matches/FinishedMatchesHeader";
import MatchesGrid from "../../ui/MatchesGrid";
import EmptyFinishedMatches from "../../features/finished_matches/EmptyFinishedMatches";
import ErrorState from "../../ui/ErrorState";

export default function FinishedMatches() {
  // UI state
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [groupByCompetition, setGroupByCompetition] = useState(false);

  // Filter states
  const [timeFilter, setTimeFilter] = useState("selected");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [resultFilter, setResultFilter] = useState("all");

  // Date sync when timeFilter changes
  useEffect(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

    switch (timeFilter) {
      case "today":
        setSelectedDate(today);
        break;
      case "yesterday":
        setSelectedDate(yesterday);
        break;
      case "selected":
        // Keep current selectedDate
        break;
    }
  }, [timeFilter]);

  const {
    matches,
    allFinishedMatches,
    loading,
    backgroundRefreshing,
    error,
    stats,
    topLeaguesCount,
    favoritesCount,
    totalCount,
    refetch,
  } = useFinishedMatches(selectedDate, {
    timeFilter,
    priorityFilter,
    resultFilter,
    autoRefresh: true,
  });

  // Group matches if needed
  const groupedMatches =
    groupByCompetition && matches.length > 0
      ? groupMatchesByCompetition(matches)
      : null;

  // Date change handler with validation
  const handleDateChange = (newDate) => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    // Block future dates
    if (newDate > today) {
      return;
    }

    setSelectedDate(newDate);
    if (timeFilter !== "selected") {
      setTimeFilter("selected");
    }
  };

  // Debug logging
  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log("FinishedMatches Debug:", {
        total: allFinishedMatches?.length || 0,
        filtered: matches?.length || 0,
        stats,
        filters: { timeFilter, priorityFilter, resultFilter },
        backgroundRefreshing,
      });
    }
  }, [
    allFinishedMatches,
    matches,
    stats,
    timeFilter,
    priorityFilter,
    resultFilter,
    backgroundRefreshing,
  ]);

  // Enhanced loading state
  if (loading) {
    return (
      <div className="relative min-h-[600px]">
        <div className="flex justify-center items-center min-h-[400px]">
          <div className="text-center">
            <div className="relative mb-6">
              <div className="animate-spin w-16 h-16 border-4 border-green-500/30 border-t-green-500 rounded-full mx-auto"></div>
              <div className="absolute inset-0 animate-ping w-16 h-16 border-4 border-green-500/20 rounded-full mx-auto opacity-20"></div>
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">
              Loading Finished Matches
            </h3>
            <p className="text-gray-300">Fetching completed match results...</p>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <ErrorState
        title="Failed to load finished matches"
        error={error}
        onRetry={refetch}
      />
    );
  }

  // No finished matches at all
  if (!allFinishedMatches || allFinishedMatches.length === 0) {
    return (
      <EmptyFinishedMatches
        selectedDate={selectedDate}
        setSelectedDate={handleDateChange}
        timeFilter={timeFilter}
        priorityFilter={priorityFilter}
        resultFilter={resultFilter}
        onRefresh={refetch}
        maxDateToday={true}
      />
    );
  }

  // No matches after filtering
  if (!matches || matches.length === 0) {
    return (
      <div className="min-h-screen bg-muted rounded-3xl p-1">
        {/* Header with filters - direktno bez animation wrapper-a */}
        <FinishedMatchesHeader
          selectedDate={selectedDate}
          setSelectedDate={handleDateChange}
          stats={stats}
          backgroundRefreshing={backgroundRefreshing}
          timeFilter={timeFilter}
          setTimeFilter={setTimeFilter}
          priorityFilter={priorityFilter}
          setPriorityFilter={setPriorityFilter}
          resultFilter={resultFilter}
          setResultFilter={setResultFilter}
          groupByCompetition={groupByCompetition}
          setGroupByCompetition={setGroupByCompetition}
          topLeaguesCount={topLeaguesCount}
          favoritesCount={favoritesCount}
          totalCount={totalCount}
          maxDateToday={true}
        />

        {/* Empty state message */}
        <div className="flex justify-center items-center min-h-[300px] px-6">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-gray-500/20 to-gray-600/30 backdrop-blur-sm border border-gray-500/30 mb-6">
              <span className="text-4xl">🔍</span>
            </div>
            <h3 className="text-2xl font-bold text-white mb-4">
              No matches found
            </h3>
            <p className="text-gray-300 mb-6 max-w-md mx-auto">
              No finished matches found with current filters. Try adjusting your
              filters or selecting a different date.
            </p>
            <button
              onClick={refetch}
              disabled={backgroundRefreshing}
              className={`group relative overflow-hidden font-semibold px-6 py-3 rounded-xl transition-all duration-300 hover:scale-105 shadow-lg flex items-center gap-2 mx-auto ${
                backgroundRefreshing
                  ? "bg-gradient-to-r from-gray-600/50 to-gray-700/50 text-gray-300 cursor-not-allowed"
                  : "bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white hover:shadow-2xl hover:shadow-blue-500/40"
              }`}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <span className="relative z-10 flex items-center gap-2">
                <span
                  className={`${backgroundRefreshing ? "animate-spin" : ""}`}
                >
                  🔄
                </span>
                {backgroundRefreshing ? "Refreshing..." : "Refresh"}
              </span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen  rounded-3xl p-1">
      <FinishedMatchesHeader
        selectedDate={selectedDate}
        setSelectedDate={handleDateChange}
        stats={stats}
        backgroundRefreshing={backgroundRefreshing}
        timeFilter={timeFilter}
        setTimeFilter={setTimeFilter}
        priorityFilter={priorityFilter}
        setPriorityFilter={setPriorityFilter}
        resultFilter={resultFilter}
        setResultFilter={setResultFilter}
        groupByCompetition={groupByCompetition}
        setGroupByCompetition={setGroupByCompetition}
        topLeaguesCount={topLeaguesCount}
        favoritesCount={favoritesCount}
        totalCount={totalCount}
        maxDateToday={true}
      />

      {/* Matches Grid - direktno bez animation wrapper-a */}
      <MatchesGrid
        groupByCompetition={groupByCompetition}
        groupedMatches={groupedMatches}
        sortedMatches={matches}
        showLiveIndicator={false}
      />

      {/* Manual refresh button - direktno bez animation wrapper-a */}
      <div className="flex justify-center mt-8 mb-4">
        <button
          onClick={refetch}
          disabled={backgroundRefreshing}
          className={`group relative overflow-hidden font-bold px-8 py-4 rounded-xl transition-all duration-300 hover:scale-105 shadow-lg flex items-center gap-2 ${
            backgroundRefreshing
              ? "bg-gradient-to-r from-gray-600/50 to-gray-700/50 text-gray-300 cursor-not-allowed"
              : "bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 text-white hover:shadow-2xl hover:shadow-green-500/40"
          }`}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <span className="relative z-10 flex items-center gap-2">
            <span className={`${backgroundRefreshing ? "animate-spin" : ""}`}>
              🔄
            </span>
            {backgroundRefreshing ? "Refreshing..." : "Manual Refresh"}
          </span>
        </button>
      </div>

      {/* Debug info za development */}
      {import.meta.env.DEV && (
        <div className="mt-6 p-3 bg-gray-800 rounded text-xs text-center max-w-4xl mx-auto space-y-1">
          <div className="text-gray-400">
            Finished Debug: {allFinishedMatches?.length || 0} total •{" "}
            {matches?.length || 0} filtered
          </div>
          {stats && (
            <div className="text-green-400">
              📊 Today: {stats.today} • Yesterday: {stats.yesterday} • Week:{" "}
              {stats.thisWeek}
            </div>
          )}
          <div className="text-cyan-400">
            ✅ Using enhanced filtering for finished matches
          </div>
          <div
            className={`${
              backgroundRefreshing ? "text-yellow-400" : "text-green-400"
            }`}
          >
            Auto-refresh: ON (5min) {backgroundRefreshing && "- Refreshing..."}
          </div>
        </div>
      )}
    </div>
  );
}
