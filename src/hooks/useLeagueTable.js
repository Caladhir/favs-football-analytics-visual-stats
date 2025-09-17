// src/hooks/useLeagueTable.js - ENHANCED VERSION
import { useState, useEffect, useCallback, useRef } from "react";
import supabase from "../services/supabase";

export function useLeagueTable(options = {}) {
  // Default options for backward compatibility
  if (typeof options === "number") {
    // Old usage: useLeagueTable(30, 6)
    const daysBack = options;
    const limit = arguments[1] || 6;
    options = { daysBack, limit, mode: "table" };
  }

  const {
    daysBack = 30,
    limit = 6,
    mode = "table", // "table" | "leaders" | "stats"
    includeForm = false,
    groupByLeague = false,
  } = options;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [teams, setTeams] = useState([]);
  const [leagueLeaders, setLeagueLeaders] = useState([]);
  const [bestAttack, setBestAttack] = useState([]);
  const [bestDefense, setBestDefense] = useState([]);
  const [bestForm, setBestForm] = useState([]);

  const mountedRef = useRef(true);

  // League detection helper
  const detectLeague = (country) => {
    const countryLeagueMap = {
      England: "Premier League",
      Spain: "La Liga",
      Italy: "Serie A",
      Germany: "Bundesliga",
      France: "Ligue 1",
      Croatia: "HNL",
    };
    return countryLeagueMap[country] || "Other";
  };

  const fetchLeagueData = useCallback(async () => {
    if (!mountedRef.current) return;

    try {
      setLoading(true);
      setError(null);

      const daysAgo = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

      // Fetch matches
      const { data: matchesData, error: matchesError } = await supabase
        .from("matches")
        .select(
          "home_team,away_team,home_score,away_score,status,start_time,home_team_id,away_team_id"
        )
        .gte("start_time", daysAgo.toISOString())
        .eq("status", "finished")
        .order("start_time", { ascending: false });

      if (!mountedRef.current) return;
      if (matchesError) throw matchesError;

      // Fetch teams for country/league info (if needed)
      let teamsById = new Map();
      let teamsByName = new Map();
      if (groupByLeague || mode === "leaders" || mode === "stats") {
        const { data: teamsData } = await supabase
          .from("teams")
          .select("id, sofascore_id, name, country, logo_url")
          .limit(2000);

        (teamsData || []).forEach((team) => {
          const info = {
            id: team.id,
            sofascore_id: team.sofascore_id,
            name: team.name,
            country: team.country,
            league: detectLeague(team.country),
            logo_url: team.logo_url || null,
          };
          teamsById.set(team.id, info);
          teamsByName.set(team.name, info);
        });
      }

      // Calculate team statistics
      const teamStats = new Map();
      const matchesByTeam = new Map(); // For form calculation

      (matchesData || []).forEach((match) => {
        const homeScore = match.home_score || 0;
        const awayScore = match.away_score || 0;

        const updateTeamStats = (
          teamName,
          teamId,
          points,
          scored,
          conceded,
          isHome
        ) => {
          const info =
            (teamId && teamsById.get(teamId)) ||
            teamsByName.get(teamName) ||
            {};
          const current = teamStats.get(teamName) || {
            name: info.name || teamName,
            points: 0,
            wins: 0,
            draws: 0,
            losses: 0,
            goalsFor: 0,
            goalsAgainst: 0,
            games: 0,
            id: info.id || teamId || null,
            country: info.country || "Unknown",
            league: info.league || "Other",
            logo_url: info.logo_url || null,
          };

          teamStats.set(teamName, {
            ...current,
            points: current.points + points,
            wins: current.wins + (points === 3 ? 1 : 0),
            draws: current.draws + (points === 1 ? 1 : 0),
            losses: current.losses + (points === 0 ? 1 : 0),
            goalsFor: current.goalsFor + scored,
            goalsAgainst: current.goalsAgainst + conceded,
            games: current.games + 1,
          });

          // Track matches for form calculation
          if (includeForm) {
            if (!matchesByTeam.has(teamName)) {
              matchesByTeam.set(teamName, []);
            }
            const result = points === 3 ? "W" : points === 1 ? "D" : "L";
            matchesByTeam.get(teamName).push({
              result,
              date: match.start_time,
              opponent: isHome ? match.away_team : match.home_team,
            });
          }
        };

        // Update stats for both teams
        if (homeScore === awayScore) {
          updateTeamStats(
            match.home_team,
            match.home_team_id,
            1,
            homeScore,
            awayScore,
            true
          );
          updateTeamStats(
            match.away_team,
            match.away_team_id,
            1,
            awayScore,
            homeScore,
            false
          );
        } else if (homeScore > awayScore) {
          updateTeamStats(
            match.home_team,
            match.home_team_id,
            3,
            homeScore,
            awayScore,
            true
          );
          updateTeamStats(
            match.away_team,
            match.away_team_id,
            0,
            awayScore,
            homeScore,
            false
          );
        } else {
          updateTeamStats(
            match.home_team,
            match.home_team_id,
            0,
            homeScore,
            awayScore,
            true
          );
          updateTeamStats(
            match.away_team,
            match.away_team_id,
            3,
            awayScore,
            homeScore,
            false
          );
        }
      });

      // Process teams data
      let teamsArray = [...teamStats.values()].map((team) => ({
        ...team,
        goalDifference: team.goalsFor - team.goalsAgainst,
        goalsPerMatch:
          team.games > 0
            ? parseFloat((team.goalsFor / team.games).toFixed(2))
            : 0,
        goalsConcededPerMatch:
          team.games > 0
            ? parseFloat((team.goalsAgainst / team.games).toFixed(2))
            : 0,
      }));

      // Add form data if requested
      if (includeForm) {
        teamsArray = teamsArray.map((team) => {
          const teamMatches = matchesByTeam.get(team.name) || [];
          const sortedMatches = teamMatches
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, 5);

          return {
            ...team,
            form: sortedMatches.map((m) => m.result),
            formScore: sortedMatches.reduce((score, match) => {
              return (
                score +
                (match.result === "W" ? 3 : match.result === "D" ? 1 : 0)
              );
            }, 0),
          };
        });
      }

      // Filter teams with actual games
      teamsArray = teamsArray.filter((team) => team.games > 0);

      // Sort teams by points, goal difference, goals for
      const sortedTeams = teamsArray.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.goalDifference !== a.goalDifference)
          return b.goalDifference - a.goalDifference;
        return b.goalsFor - a.goalsFor;
      });

      if (!mountedRef.current) return;

      // Set data based on mode
      if (mode === "table") {
        setTeams(sortedTeams.slice(0, limit));
      } else if (mode === "leaders") {
        // Dynamic league leaders: pick top team for every league present in dataset
        const leadersMap = new Map();
        for (const team of sortedTeams) {
          if (!leadersMap.has(team.league)) {
            leadersMap.set(team.league, team);
          }
        }
        const leaders = Array.from(leadersMap.values()).sort((a, b) => {
          if (b.points !== a.points) return b.points - a.points;
          if (b.goalDifference !== a.goalDifference)
            return b.goalDifference - a.goalDifference;
          return b.goalsFor - a.goalsFor;
        });
        setLeagueLeaders(leaders);
      } else if (mode === "stats") {
        // Best Attack (total goals scored in period)
        const attackLeaders = [...sortedTeams]
          .sort(
            (a, b) =>
              b.goalsFor - a.goalsFor || b.goalsPerMatch - a.goalsPerMatch
          )
          .slice(0, 5);
        setBestAttack(attackLeaders);

        // Best Defense (lowest goals conceded per match) - prefer teams with a logo
        const defenseCandidates = [...sortedTeams].filter((t) => t.logo_url);
        const defenseLeaders = (
          defenseCandidates.length ? defenseCandidates : [...sortedTeams]
        )
          .sort(
            (a, b) =>
              a.goalsConcededPerMatch - b.goalsConcededPerMatch ||
              a.goalsAgainst - b.goalsAgainst
          )
          .slice(0, 5);
        setBestDefense(defenseLeaders);
        // Legacy bestForm removed (now provided by unified useTeamForm30d hook)
      }
    } catch (err) {
      if (!mountedRef.current) return;
      console.error("Error fetching league data:", err);
      setError(err.message || "Failed to load league data");
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [daysBack, limit, mode, includeForm, groupByLeague]);

  useEffect(() => {
    mountedRef.current = true;
    fetchLeagueData();

    return () => {
      mountedRef.current = false;
    };
  }, [fetchLeagueData]);

  // Return different data based on mode
  const returnData = {
    loading,
    error,
    refetch: fetchLeagueData,
  };

  if (mode === "table") {
    return { ...returnData, teams };
  } else if (mode === "leaders") {
    return { ...returnData, leagueLeaders };
  } else if (mode === "stats") {
    return { ...returnData, bestAttack, bestDefense, bestForm };
  }

  // Default return all data for backward compatibility
  return {
    ...returnData,
    teams,
    leagueLeaders,
    bestAttack,
    bestDefense,
    bestForm,
  };
}
