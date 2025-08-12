// src/features/finished_matches/FinishedMatchesDebug.jsx
export default function FinishedMatchesDebug({
  allMatches,
  finishedMatches,
  filteredMatches,
  sortedMatches,
  stats,
  backgroundRefreshing,
}) {
  if (!import.meta.env.DEV) return null;

  return (
    <div className="mt-6 p-3 bg-gray-800 rounded text-xs text-center max-w-4xl mx-auto space-y-1">
      <div className="text-gray-400">
        Finished Debug: {allMatches?.length || 0} total •{" "}
        {finishedMatches?.length || 0} finished • {filteredMatches?.length || 0}{" "}
        filtered • {sortedMatches?.length || 0} sorted
      </div>

      {stats && (
        <div className="text-blue-400">
          Today: {stats.today} • Yesterday: {stats.yesterday} • Week:{" "}
          {stats.thisWeek} • Top: {stats.topLeagues} • Goals: {stats.withGoals}{" "}
          • Draws: {stats.draws}
        </div>
      )}

      <div className="text-cyan-400">
        ✅ Using enhanced filtering and sorting for finished matches
      </div>

      <div
        className={`${
          backgroundRefreshing ? "text-yellow-400" : "text-green-400"
        }`}
      >
        Auto-refresh: ON (5min) {backgroundRefreshing && "- Refreshing..."}
      </div>
    </div>
  );
}
