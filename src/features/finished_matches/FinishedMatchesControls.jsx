// src/features/finished_matches/FinishedMatchesControls.jsx
import GroupButton from "../../ui/GroupButton";

export default function FinishedMatchesControls({
  groupByCompetition,
  setGroupByCompetition,
  timeFilter,
  setTimeFilter,
  priorityFilter,
  setPriorityFilter,
  resultFilter,
  setResultFilter,
  topLeaguesCount,
  favoritesCount,
  totalCount,
}) {
  const timeFilterOptions = [
    { value: "all", label: "All Time", icon: "🕐" },
    { value: "today", label: "Today", icon: "📅" },
    { value: "yesterday", label: "Yesterday", icon: "🌅" },
    { value: "week", label: "This Week", icon: "📆" },
  ];

  const priorityFilterOptions = [
    { value: "all", label: "All Leagues", icon: "🌍" },
    { value: "top", label: "Top Leagues", icon: "⭐" },
    { value: "regional", label: "Regional", icon: "🏆" },
  ];

  const resultFilterOptions = [
    { value: "all", label: "All Results", icon: "⚽" },
    { value: "withGoals", label: "With Goals", icon: "🥅" },
    { value: "draws", label: "Draws", icon: "🤝" },
  ];

  return (
    <div className="text-center mb-4 space-y-3">
      {/* Filter buttons row */}
      <div className="flex justify-center items-center gap-2 flex-wrap">
        {/* Time filter */}
        <div className="flex gap-1 bg-muted/50 rounded-lg p-1">
          {timeFilterOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => setTimeFilter(option.value)}
              className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                timeFilter === option.value
                  ? "bg-green-600 text-white"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <span className="mr-1">{option.icon}</span>
              {option.label}
            </button>
          ))}
        </div>

        {/* Priority filter */}
        <div className="flex gap-1 bg-muted/50 rounded-lg p-1">
          {priorityFilterOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => setPriorityFilter(option.value)}
              className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                priorityFilter === option.value
                  ? "bg-purple-600 text-white"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <span className="mr-1">{option.icon}</span>
              {option.label}
            </button>
          ))}
        </div>

        {/* Result filter */}
        <div className="flex gap-1 bg-muted/50 rounded-lg p-1">
          {resultFilterOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => setResultFilter(option.value)}
              className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                resultFilter === option.value
                  ? "bg-blue-600 text-white"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <span className="mr-1">{option.icon}</span>
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats and group toggle row */}
      <div className="flex justify-center items-center gap-4 text-xs">
        <span className="text-muted-foreground">
          {totalCount} matches found
        </span>

        {topLeaguesCount > 0 && (
          <span className="bg-yellow-600 text-white px-2 py-1 rounded-full">
            ⭐ {topLeaguesCount} Top
          </span>
        )}

        {/* Group toggle */}
        <GroupButton
          isGrouped={groupByCompetition}
          onToggle={() => setGroupByCompetition(!groupByCompetition)}
          size="sm"
        />
      </div>
    </div>
  );
}
