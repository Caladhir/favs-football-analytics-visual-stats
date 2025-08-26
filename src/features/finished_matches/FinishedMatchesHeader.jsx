// src/features/finished_matches/FinishedMatchesHeader.jsx - REDESIGNED WITH MODERN STYLING
import CalendarPopover from "../tabs/CalendarPopover";
import GroupButton from "../../ui/GroupButton";

// Simple filter button component
function FilterButton({
  label,
  icon,
  options,
  value,
  onChange,
  className = "",
}) {
  return (
    <div className="relative group">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`
          appearance-none bg-gradient-to-r from-gray-700/80 to-gray-800/80 backdrop-blur-sm 
          text-white px-4 py-2 pr-8 rounded-xl text-sm font-semibold border border-gray-600/30 
          hover:from-gray-600/80 hover:to-gray-700/80 hover:border-gray-500/40 
          focus:outline-none focus:ring-2 focus:ring-green-400/50 
          transition-all duration-300 cursor-pointer ${className}
        `}
      >
        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
            className="bg-gray-800 text-white"
          >
            {option.icon} {option.label}
          </option>
        ))}
      </select>

      {/* Custom dropdown arrow */}
      <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
        <svg
          className="w-4 h-4 text-gray-400 group-hover:text-white transition-colors"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </div>
    </div>
  );
}

const TIME_FILTER_OPTIONS = [
  { value: "all", label: "All Time", icon: "🕐" },
  { value: "today", label: "Today", icon: "📅" },
  { value: "yesterday", label: "Yesterday", icon: "🌅" },
  { value: "week", label: "This Week", icon: "📆" },
  { value: "selected", label: "Selected Date", icon: "📍" },
];

const PRIORITY_FILTER_OPTIONS = [
  { value: "all", label: "All Leagues", icon: "🌍" },
  { value: "top", label: "Top Leagues", icon: "⭐" },
  { value: "regional", label: "Regional", icon: "🏆" },
];

const RESULT_FILTER_OPTIONS = [
  { value: "all", label: "All Results", icon: "⚽" },
  { value: "withGoals", label: "With Goals", icon: "🥅" },
  { value: "draws", label: "Draws", icon: "🤝" },
  { value: "highScoring", label: "High Scoring", icon: "🔥" },
];

export default function FinishedMatchesHeader({
  selectedDate,
  setSelectedDate,
  stats,
  backgroundRefreshing,
  timeFilter,
  setTimeFilter,
  priorityFilter,
  setPriorityFilter,
  resultFilter,
  setResultFilter,
  groupByCompetition,
  setGroupByCompetition,
  topLeaguesCount,
  totalCount,
  maxDateToday = true,
}) {
  const getContextDescription = () => {
    const datePart =
      timeFilter === "selected"
        ? `for ${selectedDate.toLocaleDateString()}`
        : TIME_FILTER_OPTIONS.find((opt) => opt.value === timeFilter)?.label ||
          "for all time";

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
          )?.label.toLowerCase()}`
        : "";

    return `Completed football matches ${datePart}${leaguePart}${resultPart}`;
  };

  return (
    <div className="relative">
      {/* Date Picker */}
      <CalendarPopover
        date={selectedDate}
        setDate={setSelectedDate}
        maxDateToday={maxDateToday}
      />

      {/* Filter Controls */}
      <div className="flex flex-wrap justify-center items-center gap-3 mt-6 mb-4">
        <FilterButton
          label="Time"
          icon="🕐"
          options={TIME_FILTER_OPTIONS}
          value={timeFilter}
          onChange={setTimeFilter}
        />

        <FilterButton
          label="Leagues"
          icon="🏆"
          options={PRIORITY_FILTER_OPTIONS}
          value={priorityFilter}
          onChange={setPriorityFilter}
        />

        <FilterButton
          label="Results"
          icon="⚽"
          options={RESULT_FILTER_OPTIONS}
          value={resultFilter}
          onChange={setResultFilter}
        />

        <GroupButton
          isGrouped={groupByCompetition}
          onToggle={() => setGroupByCompetition(!groupByCompetition)}
          size="sm"
          variant="modern"
          groupedText="📋 Grouped"
          ungroupedText="📋 Group"
        />
      </div>

      {/* Stats Display */}
      <div className="flex justify-center mt-4 mb-6">
        <div className="flex flex-wrap justify-center gap-3">
          {/* Always show total */}
          <div className="bg-gray-800/60 backdrop-blur-sm px-4 py-2 rounded-xl text-sm font-semibold shadow-lg border border-gray-700/30 flex items-center gap-2">
            <span className="text-gray-400">Total:</span>
            <span className="text-white">{totalCount}</span>
          </div>

          {topLeaguesCount > 0 && (
            <div className="bg-gray-800/60 backdrop-blur-sm px-4 py-2 rounded-xl text-sm font-semibold shadow-lg border border-gray-700/30 flex items-center gap-2">
              <span className="text-yellow-400">⭐</span>
              <span className="text-yellow-400">
                {topLeaguesCount} Top Leagues
              </span>
            </div>
          )}

          {stats && stats.today > 0 && timeFilter !== "selected" && (
            <div className="bg-gray-800/60 backdrop-blur-sm px-4 py-2 rounded-xl text-sm font-semibold shadow-lg border border-gray-700/30 flex items-center gap-2">
              <span className="text-blue-400">📅</span>
              <span className="text-blue-400">{stats.today} Today</span>
            </div>
          )}

          {stats && stats.yesterday > 0 && timeFilter !== "selected" && (
            <div className="bg-gray-800/60 backdrop-blur-sm px-4 py-2 rounded-xl text-sm font-semibold shadow-lg border border-gray-700/30 flex items-center gap-2">
              <span className="text-orange-400">🌅</span>
              <span className="text-orange-400">
                {stats.yesterday} Yesterday
              </span>
            </div>
          )}

          {stats && stats.withGoals > 0 && resultFilter === "withGoals" && (
            <div className="bg-gray-800/60 backdrop-blur-sm px-4 py-2 rounded-xl text-sm font-semibold shadow-lg border border-gray-700/30 flex items-center gap-2">
              <span className="text-cyan-400">🥅</span>
              <span className="text-cyan-400">
                {stats.withGoals} With Goals
              </span>
            </div>
          )}

          {stats && stats.draws > 0 && resultFilter === "draws" && (
            <div className="bg-gray-800/60 backdrop-blur-sm px-4 py-2 rounded-xl text-sm font-semibold shadow-lg border border-gray-700/30 flex items-center gap-2">
              <span className="text-gray-400">🤝</span>
              <span className="text-gray-400">{stats.draws} Draws</span>
            </div>
          )}

          {backgroundRefreshing && (
            <div className="bg-gray-800/60 backdrop-blur-sm px-4 py-2 rounded-xl text-sm font-semibold shadow-lg border border-gray-700/30 flex items-center gap-2">
              <div className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-blue-400">Updating...</span>
            </div>
          )}
        </div>
      </div>

      {/* Context Description */}
      <div className="text-center mb-4">
        <p className="text-gray-400 text-sm max-w-2xl mx-auto">
          {getContextDescription()}
        </p>
      </div>

      {/* Background refresh indicator */}
      {backgroundRefreshing && (
        <div className="absolute top-2 right-2">
          <div className="w-6 h-6 border-2 border-green-500/30 border-t-green-500 rounded-full animate-spin"></div>
        </div>
      )}
    </div>
  );
}
