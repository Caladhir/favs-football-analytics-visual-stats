// src/features/finished_matches/FinishedMatchesHeader.jsx - REFACTORED WITH DROPDOWNS
import CalendarPopover from "../tabs/CalendarPopover";
import FilterDropdown, {
  TIME_FILTER_OPTIONS,
  PRIORITY_FILTER_OPTIONS,
  RESULT_FILTER_OPTIONS,
} from "../../ui/FilterDropdown";
import GroupButton from "../../ui/GroupButton";

export default function FinishedMatchesHeader({
  selectedDate,
  setSelectedDate,
  stats,
  backgroundRefreshing,
  // Filter states
  timeFilter,
  setTimeFilter,
  priorityFilter,
  setPriorityFilter,
  resultFilter,
  setResultFilter,
  // Display options
  groupByCompetition,
  setGroupByCompetition,
  // Summary stats
  topLeaguesCount,
  favoritesCount,
  totalCount,
}) {
  return (
    <div className="text-center space-y-4">
      {/* Main header */}
      <div className="flex justify-center my-4">
        <div className="bg-green-600 text-white px-4 py-2 rounded-full text-sm font-medium flex items-center">
          <div
            className={`w-2 h-2 bg-white rounded-full mr-2 ${
              backgroundRefreshing ? "animate-spin" : "animate-pulse"
            }`}
          ></div>
          ✅ Finished Matches
          {backgroundRefreshing && (
            <span className="ml-2 text-xs opacity-75">...</span>
          )}
        </div>
      </div>

      {/* Date picker */}
      <CalendarPopover date={selectedDate} setDate={setSelectedDate} />

      {/* Filter Controls Row */}
      <div className="flex justify-center items-center gap-3 flex-wrap">
        {/* Time Filter Dropdown */}
        <FilterDropdown
          label="Time"
          icon="🕐"
          value={timeFilter}
          options={TIME_FILTER_OPTIONS}
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

        {/* Result Filter Dropdown */}
        <FilterDropdown
          label="Results"
          icon="⚽"
          value={resultFilter}
          options={RESULT_FILTER_OPTIONS}
          onChange={setResultFilter}
          variant="compact"
        />

        {/* Group Toggle */}
        <GroupButton
          isGrouped={groupByCompetition}
          onToggle={() => setGroupByCompetition(!groupByCompetition)}
          size="sm"
          groupedText="Grouped"
          ungroupedText="Group"
          variant="minimal"
        />
      </div>

      {/* Quick Stats Row */}
      <div className="flex justify-center items-center gap-3 flex-wrap text-xs">
        {/* Total count */}
        <span className="text-muted-foreground px-2 py-1">
          {totalCount} matches found
        </span>

        {/* Conditional stats badges */}
        {topLeaguesCount > 0 && (
          <span className="bg-yellow-600 text-white px-2 py-1 rounded-full font-medium">
            ⭐ {topLeaguesCount} Top
          </span>
        )}

        {favoritesCount > 0 && (
          <span className="bg-green-600 text-white px-2 py-1 rounded-full font-medium">
            ❤️ {favoritesCount} Favorites
          </span>
        )}

        {/* Detailed stats from hook - conditionally shown */}
        {stats && timeFilter !== "selected" && (
          <>
            {stats.today > 0 && (
              <span className="bg-blue-600 text-white px-2 py-1 rounded-full font-medium">
                📅 {stats.today} Today
              </span>
            )}

            {stats.yesterday > 0 && (
              <span className="bg-orange-600 text-white px-2 py-1 rounded-full font-medium">
                🌅 {stats.yesterday} Yesterday
              </span>
            )}

            {stats.thisWeek > 0 && timeFilter === "week" && (
              <span className="bg-purple-600 text-white px-2 py-1 rounded-full font-medium">
                📆 {stats.thisWeek} This Week
              </span>
            )}
          </>
        )}

        {stats && resultFilter !== "all" && (
          <>
            {stats.withGoals > 0 && resultFilter === "withGoals" && (
              <span className="bg-cyan-600 text-white px-2 py-1 rounded-full font-medium">
                🥅 {stats.withGoals} With Goals
              </span>
            )}

            {stats.draws > 0 && resultFilter === "draws" && (
              <span className="bg-gray-600 text-white px-2 py-1 rounded-full font-medium">
                🤝 {stats.draws} Draws
              </span>
            )}

            {stats.highScoring > 0 && resultFilter === "highScoring" && (
              <span className="bg-red-600 text-white px-2 py-1 rounded-full font-medium">
                🔥 {stats.highScoring} High Scoring
              </span>
            )}
          </>
        )}
      </div>

      {/* Context description */}
      <p className="text-muted-foreground text-sm">
        {getContextDescription(
          timeFilter,
          priorityFilter,
          resultFilter,
          selectedDate
        )}
      </p>
    </div>
  );
}

/**
 * Generate contextual description based on current filters
 */
function getContextDescription(
  timeFilter,
  priorityFilter,
  resultFilter,
  selectedDate
) {
  const datePart =
    timeFilter === "selected"
      ? `for ${selectedDate.toLocaleDateString()}`
      : TIME_FILTER_OPTIONS.find((opt) => opt.value === timeFilter)
          ?.description || "for all time";

  const leaguePart =
    priorityFilter !== "all"
      ? ` from ${PRIORITY_FILTER_OPTIONS.find(
          (opt) => opt.value === priorityFilter
        )?.label.toLowerCase()}`
      : "";

  const resultPart =
    resultFilter !== "all"
      ? ` - ${RESULT_FILTER_OPTIONS.find(
          (opt) => opt.value === resultFilter
        )?.description.toLowerCase()}`
      : "";

  return `Completed football matches ${datePart}${leaguePart}${resultPart}`;
}
