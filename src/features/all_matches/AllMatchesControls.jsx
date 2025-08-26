// src/features/all_matches/AllMatchesControls.jsx - REDESIGNED WITH MODERN STYLING
import GroupButton from "../../ui/GroupButton";

export default function AllMatchesControls({
  topLeaguesCount = 0,
  favoritesCount = 0,
  totalCount = 0,
  groupByCompetition,
  setGroupByCompetition,
  timeSortType = "smart",
  setTimeSortType = null,
  backgroundRefreshing = false,
}) {
  const handleSortToggle = () => {
    if (!setTimeSortType) return;

    const nextSort =
      timeSortType === "smart"
        ? "chronological"
        : timeSortType === "chronological"
        ? "reverse-chronological"
        : "smart";
    setTimeSortType(nextSort);
  };

  const getSortLabel = () => {
    switch (timeSortType) {
      case "chronological":
        return "⏰ Earliest First";
      case "reverse-chronological":
        return "⏰ Latest First";
      default:
        return "🤖 Smart Sort";
    }
  };

  return (
    <div className="relative mb-6">
      {/* Stats Row */}
      <div className="flex flex-wrap justify-center items-center gap-3 mb-4">
        {totalCount > 0 && (
          <div className="bg-gradient-to-r from-gray-700/80 to-gray-800/80 backdrop-blur-sm text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-lg border border-gray-600/30">
            Total: {totalCount}
          </div>
        )}

        {topLeaguesCount > 0 && (
          <div className="bg-gradient-to-r from-yellow-600/80 to-yellow-700/80 backdrop-blur-sm text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-lg border border-yellow-500/30 flex items-center gap-2">
            <span>⭐</span>
            {topLeaguesCount} Top League{topLeaguesCount === 1 ? "" : "s"}
          </div>
        )}

        {favoritesCount > 0 && (
          <div className="bg-gradient-to-r from-pink-600/80 to-pink-700/80 backdrop-blur-sm text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-lg border border-pink-500/30 flex items-center gap-2">
            <span>❤️</span>
            {favoritesCount} Favorite{favoritesCount === 1 ? "" : "s"}
          </div>
        )}

        {backgroundRefreshing && (
          <div className="bg-gradient-to-r from-blue-600/80 to-blue-700/80 backdrop-blur-sm text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-lg border border-blue-500/30 flex items-center gap-2">
            <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin"></div>
            Refreshing...
          </div>
        )}
      </div>

      {/* Controls Row */}
      <div className="flex flex-wrap justify-center items-center gap-4">
        {/* Group Toggle */}
        <div className="flex items-center gap-2">
          <GroupButton
            isGrouped={groupByCompetition}
            onToggle={() => setGroupByCompetition(!groupByCompetition)}
            size="sm"
            groupedText="📋 Grouped"
            ungroupedText="📋 Group"
            variant="modern"
            className="bg-gradient-to-r from-gray-700/80 to-gray-800/80 backdrop-blur-sm border-gray-600/30 hover:from-red-600/80 hover:to-red-700/80 hover:border-red-500/40 transition-all duration-300"
          />
        </div>

        {/* Sort Toggle (if available) */}
        {setTimeSortType && (
          <button
            onClick={handleSortToggle}
            className="group relative overflow-hidden bg-gradient-to-r from-gray-700/80 to-gray-800/80 backdrop-blur-sm text-white px-4 py-2 rounded-xl text-sm font-semibold border border-gray-600/30 hover:from-blue-600/80 hover:to-blue-700/80 hover:border-blue-500/40 transition-all duration-300 hover:scale-105 shadow-lg"
            title="Cycle through sort types"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <span className="relative z-10">{getSortLabel()}</span>
          </button>
        )}

        {/* Additional Info */}
        <div className="text-xs text-gray-400 hidden md:block">
          {groupByCompetition ? "Grouped by competition" : "All matches listed"}
          {timeSortType !== "smart" && (
            <span className="ml-2">
              •{" "}
              {timeSortType === "chronological"
                ? "Earliest first"
                : "Latest first"}
            </span>
          )}
        </div>
      </div>

      {/* Mobile Sort Indicator */}
      {timeSortType !== "smart" && (
        <div className="text-center text-xs text-gray-400 mt-2 md:hidden">
          Sorted by:{" "}
          {timeSortType === "chronological" ? "Earliest first" : "Latest first"}
        </div>
      )}
    </div>
  );
}
