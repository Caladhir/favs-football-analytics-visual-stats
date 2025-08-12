// src/features/upcoming_matches/UpcomingMatchesDebug.jsx
import React from "react";

export default function UpcomingMatchesDebug({
  matches,
  upcomingMatches,
  sortedMatches,
  userPreferences,
  backgroundRefreshing,
}) {
  if (!import.meta.env.DEV) return null;

  const topLeaguesCount = sortedMatches.filter((match) =>
    [
      "Premier League",
      "La Liga",
      "Serie A",
      "Bundesliga",
      "Ligue 1",
      "UEFA Champions League",
    ].includes(match.competition)
  ).length;

  const favoritesCount = sortedMatches.filter((m) =>
    userPreferences.favoriteTeams.some(
      (t) =>
        t.toLowerCase() === m.home_team?.toLowerCase() ||
        t.toLowerCase() === m.away_team?.toLowerCase()
    )
  ).length;

  return (
    <div className="mt-6 p-3 bg-gray-800 rounded text-xs text-center max-w-4xl mx-auto space-y-1">
      <div className="text-gray-400">
        Upcoming Debug: {matches?.length || 0} total •{" "}
        {upcomingMatches?.length || 0} upcoming • {sortedMatches?.length || 0}{" "}
        sorted
      </div>
      <div className="text-blue-400">
        Top leagues: {topLeaguesCount} • Favorites: {favoritesCount}
      </div>
      <div className="text-cyan-400">
        ✅ Filtering only upcoming matches (upcoming, notstarted, scheduled)
      </div>
      <div
        className={`${
          backgroundRefreshing ? "text-yellow-400" : "text-green-400"
        }`}
      >
        Auto-refresh: ON (2min) {backgroundRefreshing && "- Refreshing..."}
      </div>
    </div>
  );
}
