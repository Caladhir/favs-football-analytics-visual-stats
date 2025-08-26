// src/hooks/usePlayersData.js - Za vašu stvarnu bazu podataka
import { useState, useEffect, useCallback } from "react";
import supabase from "../services/supabase";

export const usePlayersData = (options = {}) => {
  const {
    limit = 50,
    position = "all",
    league = "all",
    sortBy = "name",
    searchQuery = "",
    includeStats = true,
    statsFrom = 30,
  } = options;

  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [total, setTotal] = useState(0);
  const [leagues, setLeagues] = useState([]);
  const [positions, setPositions] = useState([]);

  const fetchPlayers = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      console.log("📊 Fetching real players data from your database...");

      // Osnovni upit za igrače s JOIN-om na teams tablicu
      let query = supabase.from("players").select(`
          id,
          full_name,
          position,
          number,
          nationality,
          height_cm,
          date_of_birth,
          sofascore_id,
          created_at,
          team_id,
          teams:team_id (
            id,
            name,
            short_name,
            country,
            logo_url
          )
        `);

      // Primijeni filtere
      if (position !== "all") {
        query = query.eq("position", position);
      }

      if (searchQuery.trim()) {
        query = query.ilike("full_name", `%${searchQuery}%`);
      }

      // Izvršava upit
      const {
        data: playersData,
        error: playersError,
        count,
      } = await query.order("full_name", { ascending: true }).limit(limit);

      if (playersError) {
        console.error("❌ Players query error:", playersError);
        throw new Error(`Database error: ${playersError.message}`);
      }

      console.log(`✅ Found ${playersData?.length || 0} players in database`);

      if (!playersData || playersData.length === 0) {
        setPlayers([]);
        setTotal(0);
        setLoading(false);
        return;
      }

      // Filtriranje po ligi nakon dohvaćanja podataka (jer nije uvijek dobro za performanse raditi join filtere)
      let filteredPlayers = playersData;
      if (league !== "all") {
        filteredPlayers = playersData.filter(
          (player) =>
            player.teams?.country?.toLowerCase() === league.toLowerCase()
        );
      }

      let enrichedPlayers = filteredPlayers;

      // Dohvati statistike ako je potrebno
      if (includeStats && filteredPlayers.length > 0) {
        try {
          const playerIds = filteredPlayers.map((p) => p.id);
          const statsFromDate = new Date();
          statsFromDate.setDate(statsFromDate.getDate() - statsFrom);

          console.log(
            `📈 Fetching stats for ${
              playerIds.length
            } players since ${statsFromDate.toDateString()}`
          );

          // Dohvaća statistike - pazite na REAL tip za rating u vašoj bazi
          const { data: statsData, error: statsError } = await supabase
            .from("player_stats")
            .select(
              `
              player_id,
              goals,
              assists,
              shots_total,
              shots_on_target,
              passes,
              tackles,
              rating,
              minutes_played,
              touches,
              created_at
            `
            )
            .in("player_id", playerIds)
            .gte("created_at", statsFromDate.toISOString())
            .order("created_at", { ascending: false });

          if (statsError) {
            console.warn("⚠️ Stats query failed:", statsError);
          } else {
            console.log(`✅ Found ${statsData?.length || 0} stat records`);

            // Agregiraj statistike po igrač
            const playerStatsMap = {};
            (statsData || []).forEach((stat) => {
              if (!playerStatsMap[stat.player_id]) {
                playerStatsMap[stat.player_id] = {
                  totalGames: 0,
                  totalGoals: 0,
                  totalAssists: 0,
                  totalShots: 0,
                  totalShotsOnTarget: 0,
                  totalPasses: 0,
                  totalTackles: 0,
                  totalMinutes: 0,
                  totalTouches: 0,
                  ratings: [],
                };
              }

              const stats = playerStatsMap[stat.player_id];
              stats.totalGames += 1;
              stats.totalGoals += stat.goals || 0;
              stats.totalAssists += stat.assists || 0;
              stats.totalShots += stat.shots_total || 0;
              stats.totalShotsOnTarget += stat.shots_on_target || 0;
              stats.totalPasses += stat.passes || 0;
              stats.totalTackles += stat.tackles || 0;
              stats.totalMinutes += stat.minutes_played || 0;
              stats.totalTouches += stat.touches || 0;

              // rating je REAL tip u vašoj bazi
              if (stat.rating && stat.rating > 0) {
                stats.ratings.push(parseFloat(stat.rating));
              }
            });

            // Spoji statistike s igračima
            enrichedPlayers = filteredPlayers.map((player) => {
              const stats = playerStatsMap[player.id];

              if (!stats) {
                return {
                  ...player,
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
                    passAccuracy: 0,
                  },
                };
              }

              const avgRating =
                stats.ratings.length > 0
                  ? stats.ratings.reduce((a, b) => a + b, 0) /
                    stats.ratings.length
                  : 0;

              return {
                ...player,
                stats: {
                  games: stats.totalGames,
                  goals: stats.totalGoals,
                  assists: stats.totalAssists,
                  shots: stats.totalShots,
                  shotsOnTarget: stats.totalShotsOnTarget,
                  passes: stats.totalPasses,
                  tackles: stats.totalTackles,
                  minutes: stats.totalMinutes,
                  touches: stats.totalTouches,
                  rating: Math.round(avgRating * 10) / 10,
                  goalsPerGame:
                    stats.totalGames > 0
                      ? +(stats.totalGoals / stats.totalGames).toFixed(2)
                      : 0,
                  assistsPerGame:
                    stats.totalGames > 0
                      ? +(stats.totalAssists / stats.totalGames).toFixed(2)
                      : 0,
                  passAccuracy:
                    stats.totalShotsOnTarget > 0 && stats.totalShots > 0
                      ? +(
                          (stats.totalShotsOnTarget / stats.totalShots) *
                          100
                        ).toFixed(1)
                      : 0,
                },
              };
            });
          }
        } catch (statsErr) {
          console.warn("⚠️ Error processing stats:", statsErr);
        }
      }

      // Primijeni sortiranje
      enrichedPlayers.sort((a, b) => {
        switch (sortBy) {
          case "rating":
            return (b.stats?.rating || 0) - (a.stats?.rating || 0);
          case "goals":
            return (b.stats?.goals || 0) - (a.stats?.goals || 0);
          case "assists":
            return (b.stats?.assists || 0) - (a.stats?.assists || 0);
          case "name":
            return (a.full_name || "").localeCompare(b.full_name || "");
          case "team":
            const aTeam = a.teams?.name || "";
            const bTeam = b.teams?.name || "";
            return aTeam.localeCompare(bTeam);
          default:
            return 0;
        }
      });

      setPlayers(enrichedPlayers);
      setTotal(enrichedPlayers.length);
    } catch (err) {
      console.error("❌ Error fetching players:", err);
      setError(err.message);
      setPlayers([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [limit, position, league, sortBy, searchQuery, includeStats, statsFrom]);

  // Dohvaća metadata (pozicije i lige)
  const fetchMetadata = useCallback(async () => {
    try {
      console.log("📋 Fetching metadata from database...");

      // Dohvaća jedinstvene pozicije
      const { data: positionsData } = await supabase
        .from("players")
        .select("position")
        .not("position", "is", null)
        .neq("position", "");

      if (positionsData) {
        const uniquePositions = [
          ...new Set(positionsData.map((p) => p.position)),
        ]
          .filter(Boolean)
          .sort();
        setPositions(uniquePositions);
        console.log(
          `📍 Found ${uniquePositions.length} unique positions:`,
          uniquePositions
        );
      }

      // Dohvaća jedinstvene zemlje iz teams tablice
      const { data: countriesData } = await supabase
        .from("teams")
        .select("country")
        .not("country", "is", null)
        .neq("country", "");

      if (countriesData) {
        const uniqueCountries = [
          ...new Set(countriesData.map((t) => t.country)),
        ]
          .filter(Boolean)
          .sort();
        setLeagues(uniqueCountries);
        console.log(
          `🌍 Found ${uniqueCountries.length} unique countries:`,
          uniqueCountries
        );
      }
    } catch (err) {
      console.warn("⚠️ Failed to fetch metadata:", err);
    }
  }, []);

  const refetch = useCallback(() => {
    fetchPlayers();
    fetchMetadata();
  }, [fetchPlayers, fetchMetadata]);

  useEffect(() => {
    fetchPlayers();
    fetchMetadata();
  }, [fetchPlayers, fetchMetadata]);

  const getPlayerById = useCallback(
    (playerId) => {
      return players.find((p) => p.id === playerId);
    },
    [players]
  );

  const getTopPlayers = useCallback(
    (stat, limitCount = 5) => {
      return players
        .filter((p) => p.stats && p.stats[stat] > 0)
        .sort((a, b) => (b.stats[stat] || 0) - (a.stats[stat] || 0))
        .slice(0, limitCount);
    },
    [players]
  );

  return {
    players,
    loading,
    error,
    total,
    leagues,
    positions,
    refetch,
    getPlayerById,
    getTopPlayers,
    topScorers: getTopPlayers("goals", 10),
    topAssists: getTopPlayers("assists", 10),
    topRated: getTopPlayers("rating", 10),
    // Dodano za debug
    isEmpty: players.length === 0 && !loading && !error,
    hasData: players.length > 0,
  };
};
