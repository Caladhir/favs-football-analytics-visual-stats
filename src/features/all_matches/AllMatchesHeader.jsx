// src/features/all_matches/AllMatchesHeader.jsx - REDESIGNED WITH MODERN STYLING
import CalendarPopover from "../tabs/CalendarPopover";

export default function AllMatchesHeader({
  selectedDate,
  setSelectedDate,
  matchCount = 0,
  backgroundRefreshing = false,
  stats = null,
}) {
  return (
    <div className="relative" style={{ zIndex: 1001 }}>
      {" "}
      {/* Status Badge */}
      <div className="flex justify-center pt-4 mb-2">
        <div className="bg-gradient-to-r from-gray-700/80 to-gray-800/80 backdrop-blur-sm text-white px-6 py-3 rounded-full text-sm font-bold shadow-lg border border-gray-600/30 flex items-center gap-3">
          <span>📅</span>
          All Matches
          {matchCount > 0 && (
            <span className="bg-blue-500 text-white text-xs px-2 py-1 rounded-full">
              {matchCount}
            </span>
          )}
          {backgroundRefreshing && (
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
              <span className="text-xs text-blue-300">Updating...</span>
            </div>
          )}
        </div>
      </div>
      <div className="relative" style={{ zIndex: 10000 }}>
        {/* Calendar Popover */}
        <CalendarPopover date={selectedDate} setDate={setSelectedDate} />
        {/* Match Statistics */}
      </div>
      {stats && (
        <div className="flex justify-center mt-4 mb-6">
          <div className="flex flex-wrap justify-center gap-3">
            {stats.live > 0 && (
              <div className="bg-gray-800/60 backdrop-blur-sm px-4 py-2 rounded-xl text-sm font-semibold shadow-lg border border-gray-700/30 flex items-center gap-2">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                <span className="text-red-400">{stats.live} Live</span>
              </div>
            )}

            {stats.upcoming > 0 && (
              <div className="bg-gray-800/60 backdrop-blur-sm px-4 py-2 rounded-xl text-sm font-semibold shadow-lg border border-gray-700/30 flex items-center gap-2">
                <span className="text-blue-400">⏰</span>
                <span className="text-blue-400">{stats.upcoming} Upcoming</span>
              </div>
            )}

            {stats.finished > 0 && (
              <div className="bg-gray-800/60 backdrop-blur-sm px-4 py-2 rounded-xl text-sm font-semibold shadow-lg border border-gray-700/30 flex items-center gap-2">
                <span className="text-green-400">✅</span>
                <span className="text-green-400">
                  {stats.finished} Finished
                </span>
              </div>
            )}

            {stats.topLeagues > 0 && (
              <div className="bg-gray-800/60 backdrop-blur-sm px-4 py-2 rounded-xl text-sm font-semibold shadow-lg border border-gray-700/30 flex items-center gap-2">
                <span className="text-yellow-400">⭐</span>
                <span className="text-yellow-400">
                  {stats.topLeagues} Top Leagues
                </span>
              </div>
            )}
          </div>
        </div>
      )}
      {/* Background refresh indicator */}
      {backgroundRefreshing && (
        <div className="absolute top-2 right-2">
          <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
        </div>
      )}
    </div>
  );
}
