// src/features/tabs/FinishedMatches.jsx - WITH DATE SYNC AND FUTURE RESTRICTION
import React, { useState, useEffect } from "react";
import { useFinishedMatches } from "../../hooks/useFinishedMatches";
import { groupMatchesByCompetition } from "../../utils/matchSortingUtils";

// Components
import FinishedMatchesHeader from "../../features/finished_matches/FinishedMatchesHeader";
import MatchesGrid from "../../ui/MatchesGrid";
import FinishedMatchesDebug from "../../features/finished_matches/FinishedMatchesDebug";
import EmptyFinishedMatches from "../../features/finished_matches/EmptyFinishedMatches";
import LoadingState from "../../ui/LoadingState";
import ErrorState from "../../ui/ErrorState";

export default function FinishedMatches() {
  // UI state
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [groupByCompetition, setGroupByCompetition] = useState(false);

  // Filter states
  const [timeFilter, setTimeFilter] = useState("selected");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [resultFilter, setResultFilter] = useState("all");

  // 🔄 SYNC: Kada se promijeni timeFilter, ažuriraj selectedDate
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
        // Zadržava trenutni selectedDate
        break;
      // Za "week" i "all" ne mijenjamo selectedDate
    }
  }, [timeFilter]);

  // 🚀 Use specialized hook with filters
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
    debugInfo,
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

  // Handler za promjenu datuma (s validacijom)
  const handleDateChange = (newDate) => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    // Ne dopusti buduće datume
    if (newDate > today) {
      return;
    }

    setSelectedDate(newDate);
    // Kada ručno mijenjamo datum, prebaci na "selected" filter
    if (timeFilter !== "selected") {
      setTimeFilter("selected");
    }
  };

  // 📍 Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-muted rounded-3xl p-1">
        <div className="flex justify-center my-4">
          <div className="bg-green-600 text-white px-4 py-2 rounded-full text-sm font-medium">
            ✅ Finished Matches
          </div>
        </div>
        <LoadingState />
      </div>
    );
  }

  // 📍 Error state
  if (error) {
    return <ErrorState error={error} onRetry={refetch} />;
  }

  // 📍 No finished matches at all
  if (!allFinishedMatches || allFinishedMatches.length === 0) {
    return (
      <EmptyFinishedMatches
        selectedDate={selectedDate}
        setSelectedDate={handleDateChange}
        timeFilter={timeFilter}
        priorityFilter={priorityFilter}
        resultFilter={resultFilter}
        onRefresh={refetch}
        maxDateToday={true} // 🔒 Blokiraj budućnost
      />
    );
  }

  // 📍 No matches after filtering
  if (!matches || matches.length === 0) {
    return (
      <div className="min-h-screen bg-muted rounded-3xl p-1">
        {/* Header with filters */}
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
          maxDateToday={true} // 🔒 Blokiraj budućnost
        />

        {/* Empty state with clear filters option */}
        <div className="text-center mt-12">
          <div className="text-6xl mb-4">🔍</div>
          <p className="text-foreground font-black text-2xl mb-2">
            No matches found
          </p>
          <p className="text-muted-foreground mb-4">
            {getEmptyMessage(timeFilter, priorityFilter, resultFilter)}
          </p>
          <p className="text-muted-foreground text-sm mb-6">
            Try adjusting your filters or selecting a different date
          </p>

          <div className="flex justify-center gap-3">
            <button
              onClick={() => {
                setTimeFilter("selected");
                setPriorityFilter("all");
                setResultFilter("all");
              }}
              className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition-colors"
            >
              🗑️ Clear Filters
            </button>

            <button
              onClick={refetch}
              disabled={backgroundRefreshing}
              className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                backgroundRefreshing
                  ? "bg-gray-600 text-gray-300 cursor-not-allowed"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              }`}
            >
              {backgroundRefreshing ? "🔄 Refreshing..." : "🔄 Refresh"}
            </button>
          </div>
        </div>

        {/* Debug info */}
        <FinishedMatchesDebug
          allMatches={allFinishedMatches}
          finishedMatches={allFinishedMatches}
          filteredMatches={matches}
          sortedMatches={matches}
          stats={stats}
          backgroundRefreshing={backgroundRefreshing}
        />
      </div>
    );
  }

  // 📍 Main render with matches
  return (
    <div className="min-h-screen bg-muted rounded-3xl p-1">
      {/* Header with date picker and filter dropdowns */}
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
        maxDateToday={true} // 🔒 Blokiraj budućnost
      />

      {/* Matches grid */}
      <MatchesGrid
        groupByCompetition={groupByCompetition}
        groupedMatches={groupedMatches}
        sortedMatches={matches}
        showLiveIndicator={false}
      />

      {/* Manual refresh button */}
      <div className="flex justify-center mt-8 mb-4">
        <button
          onClick={refetch}
          disabled={backgroundRefreshing}
          className={`px-6 py-3 rounded-xl font-medium transition-all duration-200 flex items-center gap-2 ${
            backgroundRefreshing
              ? "bg-gray-600 text-gray-300 cursor-not-allowed"
              : "bg-green-600 text-white hover:bg-green-700 hover:scale-105 active:scale-95"
          }`}
        >
          <span className={`${backgroundRefreshing ? "animate-spin" : ""}`}>
            🔄
          </span>
          {backgroundRefreshing ? "Refreshing..." : "Manual Refresh"}
        </button>
      </div>

      {/* Debug info (dev only) */}
      {debugInfo && (
        <FinishedMatchesDebug
          allMatches={allFinishedMatches}
          finishedMatches={allFinishedMatches}
          filteredMatches={matches}
          sortedMatches={matches}
          stats={stats}
          backgroundRefreshing={backgroundRefreshing}
          debugInfo={debugInfo}
        />
      )}
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
