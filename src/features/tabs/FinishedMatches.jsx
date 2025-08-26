// src/features/tabs/FinishedMatches.jsx - REDESIGNED WITH MODERN STYLING
import React, { useState, useEffect } from "react";
import { useFinishedMatches } from "../../hooks/useFinishedMatches";
import { groupMatchesByCompetition } from "../../utils/matchSortingUtils";

// Components
import FinishedMatchesHeader from "../../features/finished_matches/FinishedMatchesHeader";
import MatchesGrid from "../../ui/MatchesGrid";
import EmptyFinishedMatches from "../../features/finished_matches/EmptyFinishedMatches";
import LoadingState from "../../ui/LoadingState";
import ErrorState from "../../ui/ErrorState";

export default function FinishedMatches() {
  // UI state
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [groupByCompetition, setGroupByCompetition] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // Filter states
  const [timeFilter, setTimeFilter] = useState("selected");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [resultFilter, setResultFilter] = useState("all");

  // Animation trigger
  useEffect(() => {
    setIsLoaded(true);
  }, []);

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

  // Debug logging (replaces debug component)
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
      <div className="relative">
        {/* Header with filters */}
        <div
          className={`transition-all duration-700 ${
            isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
        >
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
            topLeaguesCount={0}
            favoritesCount={0}
            totalCount={0}
            maxDateToday={true}
          />
        </div>

        {/* Empty state with clear filters option */}
        <div
          className={`text-center mt-16 px-6 transition-all duration-700 delay-300 ${
            isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
        >
          <div className="mb-6">
            <div className="text-6xl mb-4">🔍</div>
            <h3 className="text-3xl font-black text-white mb-2 bg-gradient-to-r from-green-400 via-white to-green-400 bg-clip-text text-transparent">
              No matches found
            </h3>
            <p className="text-gray-300 mb-4">
              {getEmptyMessage(timeFilter, priorityFilter, resultFilter)}
            </p>
            <p className="text-gray-400 text-sm mb-8">
              Try adjusting your filters or selecting a different date
            </p>
          </div>

          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <button
              onClick={() => {
                setTimeFilter("selected");
                setPriorityFilter("all");
                setResultFilter("all");
              }}
              className="group relative overflow-hidden bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 text-white font-bold px-6 py-3 rounded-xl transition-all duration-300 hover:scale-105 shadow-lg hover:shadow-2xl hover:shadow-green-500/40"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <span className="relative z-10 flex items-center gap-2">
                🗑️ Clear Filters
              </span>
            </button>

            <button
              onClick={refetch}
              disabled={backgroundRefreshing}
              className={`group relative overflow-hidden font-bold px-6 py-3 rounded-xl transition-all duration-300 hover:scale-105 shadow-lg ${
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

  // Main render with matches
  return (
    <div className="relative">
      {/* Header */}
      <div
        className={`transition-all duration-700 ${
          isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        }`}
      >
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
      </div>

      {/* Matches Grid */}
      <div
        className={`transition-all duration-700 delay-300 ${
          isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        }`}
      >
        <MatchesGrid
          groupByCompetition={groupByCompetition}
          groupedMatches={groupedMatches}
          sortedMatches={matches}
          showLiveIndicator={false}
        />
      </div>

      {/* Enhanced Manual refresh button */}
      <div
        className={`flex justify-center mt-8 mb-4 transition-all duration-700 delay-500 ${
          isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        }`}
      >
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
          <span
            className={`relative z-10 ${
              backgroundRefreshing ? "animate-spin" : ""
            }`}
          >
            🔄
          </span>
          <span className="relative z-10">
            {backgroundRefreshing ? "Refreshing..." : "Manual Refresh"}
          </span>
        </button>
      </div>
    </div>
  );
}

/**
 * Generate empty message based on active filters
 */
function getEmptyMessage(timeFilter, priorityFilter, resultFilter) {
  const parts = [];

  if (timeFilter !== "selected" && timeFilter !== "all") {
    const timeLabels = {
      today: "today",
      yesterday: "yesterday",
      week: "this week",
    };
    parts.push(
      `No finished matches ${timeLabels[timeFilter] || "in selected time"}`
    );
  } else {
    parts.push("No finished matches found");
  }

  if (priorityFilter !== "all") {
    const priorityLabels = {
      top: "in top leagues",
      regional: "in regional leagues",
    };
    parts.push(priorityLabels[priorityFilter]);
  }

  if (resultFilter !== "all") {
    const resultLabels = {
      withGoals: "with goals scored",
      draws: "that ended in draws",
      highScoring: "that were high-scoring",
    };
    parts.push(resultLabels[resultFilter]);
  }

  return parts.join(" ");
}
