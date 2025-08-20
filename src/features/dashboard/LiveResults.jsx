// src/features/dashboard/LiveResults.jsx - Vertically Centered
import { useLiveMatches } from "../../hooks/useLiveMatches";

function MatchRow({ match }) {
  return (
    <div className="flex items-center justify-between py-3 px-4 bg-muted/40 rounded-lg hover:bg-muted/60 transition-all duration-300 hover:scale-[1.02]">
      <div className="flex-1">
        <div className="text-sm font-medium text-center mb-1">
          <span className="font-semibold">{match.home_team}</span>
          <span className="text-muted-foreground mx-2">vs</span>
          <span className="font-semibold">{match.away_team}</span>
        </div>
        <div className="text-xs text-muted-foreground text-center flex items-center justify-center gap-2">
          <span>{match.competition}</span>
          {match.minute && (
            <span className="text-primary font-medium bg-primary/20 px-2 py-1 rounded-full">
              {match.minute}'
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-col items-center gap-2 ml-4">
        <span className="text-xs px-3 py-1 rounded-full bg-red-600 text-white font-semibold animate-pulse">
          {match.status === "ht" ? "HT" : "LIVE"}
        </span>
        <span className="font-bold text-xl text-primary">
          {match.home_score || 0} - {match.away_score || 0}
        </span>
      </div>
    </div>
  );
}

export default function LiveResults() {
  const {
    matches,
    loading,
    error,
    backgroundRefreshing,
    isRealtimeActive,
    refreshNow,
  } = useLiveMatches();

  return (
    <div className="h-full p-5 bg-card rounded-2xl shadow border border-border/50 flex flex-col">
      {/* Header */}
      <div className="text-center mb-4">
        <div className="flex items-center justify-center gap-2 mb-2">
          <h3 className="text-sm font-semibold">🔴 Live Results</h3>
          {isRealtimeActive && (
            <span
              className="w-2 h-2 bg-green-500 rounded-full animate-pulse"
              title="Real-time updates active"
            />
          )}
        </div>

        <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
          {backgroundRefreshing && (
            <span className="flex items-center gap-1">
              <span className="animate-spin">⟳</span>
              Refreshing...
            </span>
          )}
          <span className="bg-primary/20 text-primary px-2 py-1 rounded-full font-medium">
            {matches.length} in progress
          </span>
        </div>
      </div>

      {/* Content - Flexible height with centering */}
      <div className="flex-1 flex flex-col justify-center">
        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="h-16 bg-muted/40 rounded-lg animate-pulse"
              />
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <div className="text-sm text-destructive mb-4">⚠️ {error}</div>
            <button
              onClick={refreshNow}
              className="text-xs text-primary hover:text-primary/80 underline transition-colors"
            >
              Try again
            </button>
          </div>
        ) : matches.length === 0 ? (
          <div className="text-center text-muted-foreground py-12">
            <div className="text-4xl mb-2">⚽</div>
            <div className="text-sm">No live matches right now.</div>
            <div className="text-xs mt-1">
              Check back later for live action!
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {matches.slice(0, 8).map((match) => (
              <MatchRow key={match.id} match={match} />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {matches.length > 8 && (
        <div className="text-center text-xs text-muted-foreground pt-4 border-t border-border/50 mt-4">
          Showing 8 of {matches.length} live matches
        </div>
      )}
    </div>
  );
}
