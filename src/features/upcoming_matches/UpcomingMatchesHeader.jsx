// src/features/upcoming_matches/UpcomingMatchesHeader.jsx
import CalendarPopover from "../tabs/CalendarPopover";
import FilterDropdown, {
  UPCOMING_TIME_FILTER_OPTIONS,
  PRIORITY_FILTER_OPTIONS,
} from "../../ui/FilterDropdown";
import GroupButton from "../../ui/GroupButton";

export default function UpcomingMatchesHeader({
  selectedDate,
  setSelectedDate,
  stats,
  backgroundRefreshing,
  // Filter states
  timeFilter,
  setTimeFilter,
  priorityFilter,
  setPriorityFilter,
  // Display options
  groupByCompetition,
  setGroupByCompetition,
  // Summary stats
  topLeaguesCount,
  favoritesCount,
  totalCount,
  imminentCount,
}) {
  return (
    <div className="text-center space-y-4">
      {/* Main header */}
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
      <div className="flex justify-center items-center gap-3 flex-wrap">
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
          <span className="bg-green-600 text-white px-2 py-1 rounded-full font-medium">
            ❤️ {favoritesCount} Favorites
          </span>
        )}

        {/* Detailed stats from hook - conditionally shown */}
        {stats && (
          <>
            {stats.today > 0 && timeFilter !== "today" && (
              <span className="bg-blue-600 text-white px-2 py-1 rounded-full font-medium">
                📅 {stats.today} Today
              </span>
            )}

            {stats.tomorrow > 0 && timeFilter !== "tomorrow" && (
              <span className="bg-purple-600 text-white px-2 py-1 rounded-full font-medium">
                🌄 {stats.tomorrow} Tomorrow
              </span>
            )}

            {stats.next24h > 0 && timeFilter === "next24h" && (
              <span className="bg-orange-600 text-white px-2 py-1 rounded-full font-medium">
                ⏰ {stats.next24h} Next 24h
              </span>
            )}

            {stats.thisWeek > 0 && timeFilter === "week" && (
              <span className="bg-cyan-600 text-white px-2 py-1 rounded-full font-medium">
                📆 {stats.thisWeek} This Week
              </span>
            )}
          </>
        )}
      </div>

      {/* Context description */}
      <p className="text-muted-foreground text-sm">
        {getContextDescription(timeFilter, priorityFilter, selectedDate)}
      </p>
    </div>
  );
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
