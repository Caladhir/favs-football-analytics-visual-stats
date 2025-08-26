// src/features/live_matches/LiveMatchesStats.jsx - REDESIGNED WITH MODERN STYLING
export default function LiveMatchesStats({
  total,
  topLeagues,
  backgroundRefreshing,
}) {
  return (
    <div className="text-center mb-6">
      {/* Enhanced Stats Row */}
      <div className="flex flex-wrap justify-center items-center gap-3 mb-4">
        {/* Top leagues */}
        {topLeagues > 0 && (
          <div className="bg-gradient-to-r from-yellow-600/80 to-yellow-700/80 backdrop-blur-sm text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-lg border border-yellow-500/30 flex items-center gap-2">
            <span>⭐</span>
            {topLeagues} Top League{topLeagues === 1 ? "" : "s"}
          </div>
        )}

        {/* Background refresh indicator */}
        {backgroundRefreshing && (
          <div className="bg-gradient-to-r from-blue-600/80 to-blue-700/80 backdrop-blur-sm text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-lg border border-blue-500/30 flex items-center gap-2">
            <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin"></div>
            Updating...
          </div>
        )}
      </div>
    </div>
  );
}
