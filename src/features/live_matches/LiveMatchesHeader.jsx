export default function LiveMatchesHeader({
  matchCount,
  backgroundRefreshing,
}) {
  return (
    <div className="flex justify-center my-4">
      <div className="bg-red-600 text-white px-4 py-2 rounded-full text-sm font-medium flex items-center">
        <div
          className={`w-2 h-2 bg-white rounded-full mr-2 ${
            backgroundRefreshing ? "animate-spin" : "animate-pulse"
          }`}
        ></div>
        📺 {matchCount} Live {matchCount === 1 ? "Match" : "Matches"}
        {backgroundRefreshing && (
          <span className="ml-2 text-xs opacity-75">Updating...</span>
        )}
      </div>
    </div>
  );
}
