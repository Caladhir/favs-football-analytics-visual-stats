// src/utils/playerStatsAggregator.js
// Shared aggregation logic for player_stats rows -> per-player summary
// Mirrors logic previously embedded in usePlayersData.js so TopScorers & Players tab stay consistent.

/**
 * Aggregate raw player_stats rows into per-player summaries.
 * @param {Array} statsRows Array of player_stats rows (player_id,... fields)
 * @returns {Object} map: player_id -> aggregated stats object
 */
export function aggregatePlayerStats(statsRows = []) {
  const agg = {};
  if (!Array.isArray(statsRows) || !statsRows.length) return agg;
  statsRows.forEach((s) => {
    if (!s || !s.player_id) return;
    if (!agg[s.player_id]) {
      agg[s.player_id] = {
        games: 0,
        goals: 0,
        assists: 0,
        shots: 0,
        shots_on_target: 0,
        passes: 0,
        tackles: 0,
        minutes: 0,
        touches: 0,
        ratings: [],
      };
    }
    const a = agg[s.player_id];
    a.games += 1;
    a.goals += s.goals || 0;
    a.assists += s.assists || 0;
    a.shots += s.shots_total || 0;
    a.shots_on_target += s.shots_on_target || 0;
    a.passes += s.passes || 0;
    a.tackles += s.tackles || 0;
    a.minutes += s.minutes_played || 0;
    a.touches += s.touches || 0;
    if (s.rating && s.rating > 0) a.ratings.push(Number(s.rating));
  });
  return agg;
}

/**
 * Convert aggregated map to enriched player objects (input players array + agg map)
 * Adds stats field with derived metrics (per-game, per-90) identical to legacy implementation.
 */
export function attachAggregatedStats(players, aggMap) {
  return players.map((pl) => {
    const s = aggMap[pl.id];
    if (!s)
      return {
        ...pl,
        stats: {
          games: 0,
          goals: 0,
          assists: 0,
          shots: 0,
          shotsOnTarget: 0,
          passes: 0,
          tackles: 0,
          minutes: 0,
          touches: 0,
          rating: 0,
          goalsPerGame: 0,
          assistsPerGame: 0,
          goalsPer90: 0,
          assistsPer90: 0,
          shotAccuracy: 0,
          passAccuracy: 0,
        },
      };
    const avgR = s.ratings.length
      ? s.ratings.reduce((x, y) => x + y, 0) / s.ratings.length
      : 0;
    const goalsPerGame = s.games ? +(s.goals / s.games).toFixed(2) : 0;
    const assistsPerGame = s.games ? +(s.assists / s.games).toFixed(2) : 0;
    const denom90 = s.minutes ? s.minutes / 90 : 0;
    const goalsPer90 = denom90 ? +(s.goals / denom90).toFixed(2) : 0;
    const assistsPer90 = denom90 ? +(s.assists / denom90).toFixed(2) : 0;
    const shotAccuracy =
      s.shots_on_target > 0 && s.shots > 0
        ? +((s.shots_on_target / s.shots) * 100).toFixed(1)
        : 0;
    return {
      ...pl,
      stats: {
        games: s.games,
        goals: s.goals,
        assists: s.assists,
        shots: s.shots,
        shotsOnTarget: s.shots_on_target,
        passes: s.passes,
        tackles: s.tackles,
        minutes: s.minutes,
        touches: s.touches,
        rating: +avgR.toFixed(1),
        goalsPerGame,
        assistsPerGame,
        goalsPer90,
        assistsPer90,
        shotAccuracy,
        passAccuracy: shotAccuracy,
      },
    };
  });
}

/**
 * Helper: compute top scorers (consistent tie-breakers) from a set of aggregated stats.
 * Returns sorted array of objects { player_id, goals, assists, minutes }
 */
export function computeTopScorersFromAgg(aggMap, limit = 10) {
  const rows = Object.entries(aggMap).map(([player_id, s]) => ({
    player_id,
    goals: s.goals || 0,
    assists: s.assists || 0,
    minutes: s.minutes || 0,
  }));
  rows.sort(
    (a, b) =>
      b.goals - a.goals || b.assists - a.assists || b.minutes - a.minutes || 0
  );
  return rows.slice(0, limit);
}
