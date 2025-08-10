import { findProblemMatches } from "../../utils/matchStatusUtils";

export default function LiveMatchesDebug({
  matches,
  sortedMatches,
  topLeaguesCount,
  favoritesCount,
  groupByCompetition,
  backgroundRefreshing,
}) {
  if (!import.meta.env.DEV) return null;

  const problemMatches = findProblemMatches(matches, false);

  return (
    <div className="mt-6 p-3 bg-gray-800 rounded text-xs text-center max-w-4xl mx-auto space-y-1">
      <div className="text-gray-400">
        Live Debug: {matches.length} live • {sortedMatches.length} sorted •{" "}
        {problemMatches.length} problems
      </div>
      <div className="text-blue-400">
        Top leagues: {topLeaguesCount} • Favorites: {favoritesCount} • Grouped:{" "}
        {groupByCompetition ? "YES" : "NO"}
      </div>
      <div className="text-cyan-400">
        ✅ Using relaxed filter (10h limit instead of 3h)
      </div>
      <div
        className={`${
          backgroundRefreshing ? "text-yellow-400" : "text-green-400"
        }`}
      >
        Auto-refresh: ON (30s) {backgroundRefreshing && "- Refreshing..."}
      </div>
    </div>
  );
}
