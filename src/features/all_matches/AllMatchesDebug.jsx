// src/features/all_matches/AllMatchesDebug.jsx - UPDATED FOR NEW STRUCTURE
export default function AllMatchesDebug({
  matches,
  sortedMatches,
  userPreferences,
  backgroundRefreshing,
  stats,
}) {
  if (!import.meta.env.DEV) return null;

  return (
    <div className="mt-6 p-3 bg-gray-800 rounded text-xs text-center max-w-4xl mx-auto space-y-1">
      <div className="text-gray-400">
        All Matches Debug: {matches?.length || 0} raw •{" "}
        {sortedMatches?.length || 0} sorted
      </div>

      {stats && (
        <div className="text-blue-400">
          📊 Status Breakdown: {stats.live} live • {stats.upcoming} upcoming •{" "}
          {stats.finished} finished
        </div>
      )}

      {stats && (
        <div className="text-green-400">
          🎯 Quality: {stats.topLeagues} top leagues • {stats.favorites}{" "}
          favorites
        </div>
      )}

      <div className="text-cyan-400">
        ✅ Using enhanced deduplication and smart sorting
      </div>

      <div className="text-purple-400">
        🔧 User Prefs: {userPreferences?.favoriteTeams?.length || 0} teams •{" "}
        {userPreferences?.favoriteLeagues?.length || 0} leagues
      </div>

      <div
        className={`${
          backgroundRefreshing ? "text-yellow-400" : "text-green-400"
        }`}
      >
        Auto-refresh: {backgroundRefreshing ? "ON (refreshing...)" : "ON (30s)"}
      </div>

      <div className="text-gray-500 text-[10px] mt-2">
        Last refresh: {new Date().toLocaleTimeString()}
      </div>
    </div>
  );
}
