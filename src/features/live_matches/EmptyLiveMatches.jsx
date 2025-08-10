export default function EmptyLiveMatches({ onRefresh }) {
  return (
    <div className="min-h-screen bg-muted rounded-3xl p-1">
      <div className="flex justify-center my-4">
        <div className="bg-gray-600 text-white px-4 py-2 rounded-full text-sm font-medium">
          📺 Live Matches
        </div>
      </div>

      <div className="text-center mt-12">
        <div className="text-6xl mb-4">⚽</div>
        <p className="text-foreground font-black text-2xl mb-2">
          No Live Matches
        </p>
        <p className="text-muted-foreground">
          There are currently no live football matches.
        </p>
        <p className="text-muted-foreground text-sm mt-2">
          Check back later or view all matches for today.
        </p>

        <button
          onClick={onRefresh}
          className="mt-6 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          🔄 Refresh
        </button>
      </div>
    </div>
  );
}
