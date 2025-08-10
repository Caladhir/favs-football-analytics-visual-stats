import MatchCard from "./MatchCard";

export default function MatchesGrid({
  groupByCompetition,
  groupedMatches,
  sortedMatches,
  showLiveIndicator = false,
}) {
  if (groupByCompetition && groupedMatches) {
    return (
      <div className="space-y-6 max-w-6xl mx-auto">
        {groupedMatches.map((group) => (
          <div key={group.competition} className="space-y-3">
            <div className="flex items-center justify-between px-2">
              <h3 className="text-lg font-semibold text-foreground flex items-center">
                {group.competition}
                {showLiveIndicator && group.liveCount > 0 && (
                  <span className="ml-2 bg-red-600 text-white text-xs px-2 py-1 rounded-full animate-pulse">
                    {group.liveCount} LIVE
                  </span>
                )}
                {group.priority > 80 && (
                  <span className="ml-2 text-yellow-400" title="Top League">
                    ⭐
                  </span>
                )}
              </h3>
              <span className="text-sm text-muted-foreground">
                {group.matches.length}{" "}
                {group.matches.length === 1 ? "match" : "matches"}
              </span>
            </div>
            <ul className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {group.matches.map((match) => (
                <MatchCard key={match.id} match={match} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    );
  }

  // Standard flat list
  return (
    <ul className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-6xl mx-auto">
      {sortedMatches.map((match) => (
        <MatchCard key={match.id} match={match} />
      ))}
    </ul>
  );
}
