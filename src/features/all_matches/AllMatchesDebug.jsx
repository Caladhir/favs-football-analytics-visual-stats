// src/components/AllMatches/AllMatchesDebug.jsx - S LIVE COUNT PROP
import React from "react";
import { findProblemMatches } from "../../utils/matchStatusUtils";

export default function AllMatchesDebug({
  matches,
  sortedMatches,
  userPreferences,
  backgroundRefreshing,
  liveMatchesCount = 0, // 🔧 DODANO kao prop
}) {
  if (!import.meta.env.DEV) return null;

  const problemMatches = findProblemMatches(matches);
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
        Debug: {matches.length} total • {sortedMatches.length} sorted •{" "}
        {liveMatchesCount} live • {problemMatches.length} problems
      </div>
      <div className="text-blue-400">
        Top leagues: {topLeaguesCount} • Favorites: {favoritesCount}
      </div>
      {liveMatchesCount > 0 && (
        <div
          className={`${
            backgroundRefreshing ? "text-yellow-400" : "text-green-400"
          }`}
        >
          Auto-refresh: ON (30s) {backgroundRefreshing && "- Refreshing..."}
        </div>
      )}
    </div>
  );
}
