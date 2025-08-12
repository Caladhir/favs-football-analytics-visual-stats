// src/features/tabs/UpcomingMatches.jsx - WITH TIME SORT BUTTON
import React, { useState } from "react";
import { useUpcomingMatches } from "../../hooks/useUpcomingMatches";
import { groupMatchesByCompetition } from "../../utils/matchSortingUtils";

// Components
import UpcomingMatchesHeader from "../../features/upcoming_matches/UpcomingMatchesHeader";
import MatchesGrid from "../../ui/MatchesGrid";
import LoadingState from "../../ui/LoadingState";
import ErrorState from "../../ui/ErrorState";
import TimeSortButton, { applyTimeSort } from "../../ui/TimeSortButton";
import FilterDropdown, {
  UPCOMING_TIME_FILTER_OPTIONS,
  PRIORITY_FILTER_OPTIONS,
} from "../../ui/FilterDropdown";
import CalendarPopover from "../tabs/CalendarPopover";

export default function UpcomingMatches() {
  // UI state
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [groupByCompetition, setGroupByCompetition] = useState(false);
  const [timeSortType, setTimeSortType] = useState("chronological"); // 🆕 Default to chronological for upcoming

  // Filter states
  const [timeFilter, setTimeFilter] = useState("selected");
  const [priorityFilter, setPriorityFilter] = useState("all");

  // 🚀 NEW: Use specialized hook with filters
  const {
    matches: hookMatches,
    allUpcomingMatches,
    imminentMatches,
    loading,
    backgroundRefreshing,
    error,
    stats,
    topLeaguesCount,
    favoritesCount,
    totalCount,
    imminentCount,
    refetch,
    debugInfo,
  } = useUpcomingMatches(selectedDate, {
    timeFilter,
    priorityFilter,
    autoRefresh: true,
  });

  // 🆕 Apply time sorting to hook results
  const matches = React.useMemo(() => {
    if (!hookMatches || hookMatches.length === 0) return [];
    return applyTimeSort(hookMatches, timeSortType);
  }, [hookMatches, timeSortType]);

  // Group matches if needed
  const groupedMatches =
    groupByCompetition && matches.length > 0
      ? groupMatchesByCompetition(matches)
      : null;

  // 🔧 Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-muted rounded-3xl p-1">
        <div className="flex justify-center my-4">
          <div className="bg-blue-600 text-white px-4 py-2 rounded-full text-sm font-medium">
            ⏰ Upcoming Matches
          </div>
        </div>
        <LoadingState />
      </div>
    );
  }

  // 🔧 Error state
  if (error) {
    return <ErrorState error={error} onRetry={refetch} />;
  }

  // 🔧 No upcoming matches at all
  if (!allUpcomingMatches || allUpcomingMatches.length === 0) {
    return (
      <div className="min-h-screen bg-muted rounded-3xl p-1">
        <div className="flex justify-center my-4">
          <div className="bg-gray-600 text-white px-4 py-2 rounded-full text-sm font-medium">
            ⏰ Upcoming Matches
          </div>
        </div>

        <CalendarPopover date={selectedDate} setDate={setSelectedDate} />

        <div className="text-center mt-12">
          <div className="text-6xl mb-4">⏰</div>
          <p className="text-foreground font-black text-2xl mb-2">
            No Upcoming Matches
          </p>
          <p className="text-muted-foreground">
            There are currently no scheduled matches.
          </p>
          <p className="text-muted-foreground text-sm mt-2">
            Try selecting a different date or check back later.
          </p>

          <button
            onClick={refetch}
            className="mt-6 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            🔄 Refresh
          </button>
        </div>
      </div>
    );
  }

  // 🔧 No matches after filtering
  if (!matches || matches.length === 0) {
    return (
      <div className="min-h-screen bg-muted rounded-3xl p-1">
        {/* Header */}
        <div className="flex justify-center my-4">
          <div className="bg-blue-600 text-white px-4 py-2 rounded-full text-sm font-medium">
            ⏰ Upcoming Matches
          </div>
        </div>

        <CalendarPopover date={selectedDate} setDate={setSelectedDate} />

        {/* Filter Controls */}
        <div className="flex justify-center items-center gap-3 flex-wrap mb-4">
          <FilterDropdown
            label="Time"
            icon="⏰"
            value={timeFilter}
            options={UPCOMING_TIME_FILTER_OPTIONS}
            onChange={setTimeFilter}
            variant="compact"
          />

          <FilterDropdown
            label="Leagues"
            icon="🏆"
            value={priorityFilter}
            options={PRIORITY_FILTER_OPTIONS}
            onChange={setPriorityFilter}
            variant="compact"
          />
        </div>

        {/* Empty state with clear filters option */}
        <div className="text-center mt-12">
          <div className="text-6xl mb-4">🔍</div>
          <p className="text-foreground font-black text-2xl mb-2">
            No matches found
          </p>
          <p className="text-muted-foreground mb-4">
            {getEmptyMessage(timeFilter, priorityFilter)}
          </p>
          <p className="text-muted-foreground text-sm mb-6">
            Try adjusting your filters or selecting a different date
          </p>

          <div className="flex justify-center gap-3">
            <button
              onClick={() => {
                setTimeFilter("selected");
                setPriorityFilter("all");
              }}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              🗑️ Clear Filters
            </button>

            <button
              onClick={refetch}
              disabled={backgroundRefreshing}
              className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                backgroundRefreshing
                  ? "bg-gray-600 text-gray-300 cursor-not-allowed"
                  : "bg-green-600 text-white hover:bg-green-700"
              }`}
            >
              {backgroundRefreshing ? "🔄 Refreshing..." : "🔄 Refresh"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 🔧 Main render with matches
  return (
    <div className="min-h-screen bg-muted rounded-3xl p-1">
      {/* Header */}
      <div className="flex justify-center my-4">
        <div className="bg-blue-600 text-white px-4 py-2 rounded-full text-sm font-medium flex items-center">
          <div
            className={`w-2 h-2 bg-white rounded-full mr-2 ${
              backgroundRefreshing ? "animate-spin" : "animate-pulse"
            }`}
          ></div>
          ⏰ Upcoming Matches
          {backgroundRefreshing && (
            <span className="ml-2 text-xs opacity-75">...</span>
          )}
        </div>
      </div>

      {/* Date picker */}
      <CalendarPopover date={selectedDate} setDate={setSelectedDate} />

      {/* Filter Controls Row */}
      <div className="flex justify-center items-center gap-3 flex-wrap mb-4">
        {/* Time Filter Dropdown */}
        <FilterDropdown
          label="Time"
          icon="⏰"
          value={timeFilter}
          options={UPCOMING_TIME_FILTER_OPTIONS}
          onChange={setTimeFilter}
          variant="compact"
        />

        {/* League Priority Filter Dropdown */}
        <FilterDropdown
          label="Leagues"
          icon="🏆"
          value={priorityFilter}
          options={PRIORITY_FILTER_OPTIONS}
          onChange={setPriorityFilter}
          variant="compact"
        />

        {/* Group Toggle */}
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

      {/* Quick Stats Row */}
      <div className="flex justify-center items-center gap-3 flex-wrap text-xs mb-4">
        {/* Total count */}
        <span className="text-muted-foreground px-2 py-1">
          {totalCount} matches found
        </span>

        {/* Imminent matches (starting soon) */}
        {imminentCount > 0 && (
          <span className="bg-red-600 text-white px-2 py-1 rounded-full font-medium animate-pulse">
            🚨 {imminentCount} Starting Soon
          </span>
        )}

        {/* Conditional stats badges */}
        {topLeaguesCount > 0 && (
          <span className="bg-yellow-600 text-white px-2 py-1 rounded-full font-medium">
            ⭐ {topLeaguesCount} Top
          </span>
        )}

        {favoritesCount > 0 && (
          <span className="bg-purple-600 text-white px-2 py-1 rounded-full font-medium">
            ❤️ {favoritesCount} Favorites
          </span>
        )}

        {/* Sort type indicator */}
        {timeSortType !== "chronological" && (
          <span className="bg-gray-600 text-white px-2 py-1 rounded-full font-medium text-[10px]">
            {timeSortType === "smart" ? "🤖 Smart" : "⏰↓ Latest First"}
          </span>
        )}
      </div>

      {/* Context description */}
      <p className="text-muted-foreground text-sm text-center mb-6">
        {getContextDescription(timeFilter, priorityFilter, selectedDate)}
      </p>

      {/* Imminent matches warning (if any) */}
      {imminentMatches && imminentMatches.length > 0 && (
        <div className="max-w-4xl mx-auto mb-6">
          <div className="bg-red-600/20 border-2 border-red-600 rounded-xl p-4">
            <h3 className="text-red-600 font-bold mb-2 text-center">
              🚨 Starting Soon ({imminentMatches.length})
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 text-sm">
              {imminentMatches.slice(0, 4).map((match) => (
                <div
                  key={match.id}
                  className="bg-red-600/10 rounded-lg p-2 text-center"
                >
                  <div className="font-medium">
                    {match.home_team} vs {match.away_team}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(match.start_time).toLocaleTimeString()} •{" "}
                    {match.competition}
                  </div>
                </div>
              ))}
              {imminentMatches.length > 4 && (
                <div className="text-center text-red-600 font-medium col-span-full">
                  ...and {imminentMatches.length - 4} more starting soon
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Matches grid */}
      <MatchesGrid
        groupByCompetition={groupByCompetition}
        groupedMatches={groupedMatches}
        sortedMatches={matches}
        showLiveIndicator={false}
      />

      {/* Manual refresh button */}
      <div className="flex justify-center items-center gap-3 mt-8 mb-4">
        <button
          onClick={refetch}
          disabled={backgroundRefreshing}
          className={`px-6 py-3 rounded-xl font-medium transition-all duration-200 flex items-center gap-2 ${
            backgroundRefreshing
              ? "bg-gray-600 text-gray-300 cursor-not-allowed"
              : "bg-blue-600 text-white hover:bg-blue-700 hover:scale-105 active:scale-95"
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
              timeSortType === "chronological"
                ? "reverse-chronological"
                : timeSortType === "reverse-chronological"
                ? "smart"
                : "chronological";
            setTimeSortType(nextSort);
          }}
          className="md:hidden px-4 py-2 bg-muted text-foreground rounded-lg border border-border hover:bg-muted/80 transition-colors"
          title="Cycle sort type"
        >
          {timeSortType === "chronological"
            ? "⏰↑"
            : timeSortType === "reverse-chronological"
            ? "⏰↓"
            : "🤖"}
        </button>
      </div>

      {/* Debug info (dev only) */}
      {debugInfo && import.meta.env.DEV && (
        <div className="mt-6 p-3 bg-gray-800 rounded text-xs text-center max-w-4xl mx-auto space-y-1">
          <div className="text-gray-400">
            Upcoming Debug: {debugInfo.totalMatches} total •{" "}
            {debugInfo.upcomingMatches} upcoming • {debugInfo.finalSorted}{" "}
            sorted • Sort: {timeSortType}
          </div>
          <div className="text-blue-400">
            Selected: {stats?.selected || 0} • Today: {stats?.today || 0} •
            Tomorrow: {stats?.tomorrow || 0}
          </div>
          <div className="text-cyan-400">
            ✅ Using enhanced filtering and time sorting
          </div>
          <div
            className={`${
              backgroundRefreshing ? "text-yellow-400" : "text-green-400"
            }`}
          >
            Auto-refresh: ON (2min) {backgroundRefreshing && "- Refreshing..."}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Generate empty message based on active filters
 */
function getEmptyMessage(timeFilter, priorityFilter) {
  const parts = [];

  if (timeFilter !== "selected" && timeFilter !== "all") {
    const timeLabels = {
      today: "today",
      tomorrow: "tomorrow",
      next24h: "in the next 24 hours",
      week: "this week",
    };
    parts.push(
      `No upcoming matches ${timeLabels[timeFilter] || "in selected time"}`
    );
  } else {
    parts.push("No upcoming matches found");
  }

  if (priorityFilter !== "all") {
    const priorityLabels = {
      top: "in top leagues",
      regional: "in regional leagues",
    };
    parts.push(priorityLabels[priorityFilter]);
  }

  return parts.join(" ");
}

/**
 * Generate contextual description based on current filters
 */
function getContextDescription(timeFilter, priorityFilter, selectedDate) {
  const datePart =
    timeFilter === "selected"
      ? `for ${selectedDate.toLocaleDateString()}`
      : UPCOMING_TIME_FILTER_OPTIONS.find((opt) => opt.value === timeFilter)
          ?.description || "for all time";

  const leaguePart =
    priorityFilter !== "all"
      ? ` from ${PRIORITY_FILTER_OPTIONS.find(
          (opt) => opt.value === priorityFilter
        )?.label.toLowerCase()}`
      : "";

  return `Scheduled football matches ${datePart}${leaguePart}`;
}
