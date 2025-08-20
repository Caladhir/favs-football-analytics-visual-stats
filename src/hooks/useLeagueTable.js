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
        .select("home_team,away_team,home_score,away_score,status,start_time")
        .gte("start_time", daysAgo.toISOString())
        .eq("status", "finished")
        .order("start_time", { ascending: false });

      if (!mountedRef.current) return;
      if (matchesError) throw matchesError;

      // Fetch teams for country/league info (if needed)
      let teamsInfo = new Map();
      if (groupByLeague || mode === "leaders" || mode === "stats") {
        const { data: teamsData } = await supabase
          .from("teams")
          .select("name, country")
          .limit(200);

        (teamsData || []).forEach((team) => {
          teamsInfo.set(team.name, {
            country: team.country,
            league: detectLeague(team.country),
          });
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
          points,
          scored,
          conceded,
          isHome
        ) => {
          const current = teamStats.get(teamName) || {
            name: teamName,
            points: 0,
            wins: 0,
            draws: 0,
            losses: 0,
            goalsFor: 0,
            goalsAgainst: 0,
            games: 0,
            country: teamsInfo.get(teamName)?.country || "Unknown",
            league: teamsInfo.get(teamName)?.league || "Other",
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
          updateTeamStats(match.home_team, 1, homeScore, awayScore, true);
          updateTeamStats(match.away_team, 1, awayScore, homeScore, false);
        } else if (homeScore > awayScore) {
          updateTeamStats(match.home_team, 3, homeScore, awayScore, true);
          updateTeamStats(match.away_team, 0, awayScore, homeScore, false);
        } else {
          updateTeamStats(match.home_team, 0, homeScore, awayScore, true);
          updateTeamStats(match.away_team, 3, awayScore, homeScore, false);
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
        // Get league leaders (top team from each major league)
        const leagues = [
          "Premier League",
          "La Liga",
          "Serie A",
          "Bundesliga",
          "Ligue 1",
          "HNL",
        ];
        const leaders = [];

        leagues.forEach((league) => {
          const leagueTeams = sortedTeams.filter(
            (team) => team.league === league
          );
          if (leagueTeams.length > 0) {
            leaders.push(leagueTeams[0]);
          }
        });

        setLeagueLeaders(leaders);
      } else if (mode === "stats") {
        // Best Attack (highest goals per match)
        const attackLeaders = [...sortedTeams]
          .sort((a, b) => b.goalsPerMatch - a.goalsPerMatch)
          .slice(0, 5);
        setBestAttack(attackLeaders);

        // Best Defense (lowest goals conceded per match)
        const defenseLeaders = [...sortedTeams]
          .sort((a, b) => a.goalsConcededPerMatch - b.goalsConcededPerMatch)
          .slice(0, 5);
        setBestDefense(defenseLeaders);

        // Best Form (if form data available)
        if (includeForm) {
          const formLeaders = [...sortedTeams]
            .filter((team) => team.form && team.form.length >= 3)
            .sort((a, b) => b.formScore - a.formScore)
            .slice(0, 5);
          setBestForm(formLeaders);
        }
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
