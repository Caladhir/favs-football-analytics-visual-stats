// src/features/live_matches/LiveMatchesHeader.jsx - REDESIGNED WITH MODERN STYLING
export default function LiveMatchesHeader({
  matchCount,
  backgroundRefreshing,
  lastRefreshed,
  isRealtimeActive,
}) {
  const formatLastRefreshed = (timestamp) => {
    if (!timestamp) return null;
    const now = new Date();
    const diff = Math.floor((now - new Date(timestamp)) / 1000);

    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  };

  return (
    <div className="relative">
      {/* Real-time status */}
      {isRealtimeActive && (
        <div className="flex justify-center mt-3">
          <div className="bg-gradient-to-r from-green-600/20 via-green-500/30 to-green-600/20 backdrop-blur-sm border border-green-500/20 text-green-300 px-4 py-2 rounded-xl text-sm flex items-center gap-2">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
            Real-time updates active
          </div>
        </div>
      )}

      {/* Background refresh indicator */}
      {backgroundRefreshing && (
        <div className="absolute top-2 right-2">
          <div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
        </div>
      )}
    </div>
  );
}
