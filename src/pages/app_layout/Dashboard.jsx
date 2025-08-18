import React, { useState, useEffect } from "react";

// Import actual Supabase client
import supabase from "../../services/supabase";

// Real Dashboard Components with Supabase integration
function QuickStats() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    matchesToday: 0,
    avgGoals7d: 0,
    activePlayers7d: 0,
  });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);

        // Today's matches
        const now = new Date();
        const startOfDay = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate()
        );
        const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

        const { count: matchesToday } = await supabase
          .from("matches")
          .select("id", { count: "exact", head: true })
          .gte("start_time", startOfDay.toISOString())
          .lt("start_time", endOfDay.toISOString());

        // Last 7 days average goals
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const { data: weekMatches } = await supabase
          .from("matches")
          .select("home_score,away_score")
          .gte("start_time", sevenDaysAgo.toISOString());

        const totalGoals = (weekMatches || []).reduce(
          (sum, match) =>
            sum + (match.home_score || 0) + (match.away_score || 0),
          0
        );
        const avgGoals = weekMatches?.length
          ? (totalGoals / weekMatches.length).toFixed(2)
          : 0;

        // Active players (with stats in last 7 days)
        const { data: playerStats } = await supabase
          .from("player_stats")
          .select("player_id")
          .gte("created_at", sevenDaysAgo.toISOString());

        const uniquePlayers = new Set(
          (playerStats || []).map((s) => s.player_id)
        );

        setStats({
          matchesToday: matchesToday || 0,
          avgGoals7d: Number(avgGoals),
          activePlayers7d: uniquePlayers.size,
        });
      } catch (error) {
        console.error("Error fetching quick stats:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="p-5 bg-card/60 rounded-2xl animate-pulse h-24"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {[
        { title: "Total Matches (today)", value: stats.matchesToday },
        { title: "Avg Goals (7d)", value: stats.avgGoals7d },
        { title: "Active Players (7d)", value: `${stats.activePlayers7d}+` },
      ].map((stat, idx) => (
        <div
          key={idx}
          className="p-5 bg-card/60 rounded-2xl shadow border border-border/50"
        >
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            {stat.title}
          </div>
          <div className="mt-2 text-3xl font-bold">{stat.value}</div>
        </div>
      ))}
    </div>
  );
}

function StatOfTheDay() {
  const [loading, setLoading] = useState(true);
  const [stat, setStat] = useState(null);

  useEffect(() => {
    const fetchStat = async () => {
      try {
        setLoading(true);
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        const { data } = await supabase
          .from("matches")
          .select("home_team,away_team,home_score,away_score")
          .gte("start_time", sevenDaysAgo.toISOString())
          .eq("status", "finished")
          .order("start_time", { ascending: false })
          .limit(200);

        let bestMatch = null;
        (data || []).forEach((match) => {
          const totalGoals = (match.home_score || 0) + (match.away_score || 0);
          if (!bestMatch || totalGoals > bestMatch.goals) {
            bestMatch = {
              teams: `${match.home_team} vs ${match.away_team}`,
              goals: totalGoals,
            };
          }
        });

        setStat(bestMatch);
      } catch (error) {
        console.error("Error fetching stat of the day:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchStat();
  }, []);

  return (
    <div className="p-5">
      <div className="text-sm font-semibold mb-2">Stat of the Day</div>
      {loading ? (
        <div className="h-5 w-52 bg-muted/40 rounded animate-pulse" />
      ) : stat ? (
        <div className="text-sm text-muted-foreground">
          Highest scoring match (7d):
          <span className="font-semibold text-foreground">
            {" "}
            {stat.teams}
          </span>{" "}
          with
          <span className="font-semibold text-foreground">
            {" "}
            {stat.goals}
          </span>{" "}
          total goals.
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">No data available.</div>
      )}
    </div>
  );
}

function UpsetAlert() {
  const [loading, setLoading] = useState(true);
  const [upset, setUpset] = useState(null);

  useEffect(() => {
    const fetchUpset = async () => {
      try {
        setLoading(true);
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        const { data } = await supabase
          .from("matches")
          .select("home_team,away_team,home_score,away_score,competition")
          .eq("status", "finished")
          .gte("start_time", sevenDaysAgo.toISOString())
          .order("start_time", { ascending: false })
          .limit(100);

        // Find upset: away team wins by 2+ goals
        const upsetMatch = (data || []).find(
          (match) => (match.away_score || 0) - (match.home_score || 0) >= 2
        );

        setUpset(upsetMatch || (data && data[0]) || null);
      } catch (error) {
        console.error("Error fetching upset alert:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchUpset();
  }, []);

  return (
    <div className="p-5">
      <div className="text-sm font-semibold mb-2">Upset Alert</div>
      {loading ? (
        <div className="h-5 w-60 bg-muted/40 rounded animate-pulse" />
      ) : upset ? (
        <div className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">
            {upset.away_team}
          </span>{" "}
          shocked
          <span className="font-semibold text-foreground">
            {" "}
            {upset.home_team}
          </span>{" "}
          in {upset.competition || "recent match"} — {upset.away_score}:
          {upset.home_score}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">
          No recent upsets detected.
        </div>
      )}
    </div>
  );
}

function FormGuide() {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({ total: 0, over25: 0 });

  useEffect(() => {
    const fetchFormGuide = async () => {
      try {
        setLoading(true);
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        const { data } = await supabase
          .from("matches")
          .select("home_score,away_score")
          .gte("start_time", sevenDaysAgo.toISOString())
          .eq("status", "finished");

        const matches = data || [];
        const over25 = matches.filter(
          (match) => (match.home_score || 0) + (match.away_score || 0) > 2
        ).length;

        setSummary({ total: matches.length, over25 });
      } catch (error) {
        console.error("Error fetching form guide:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchFormGuide();
  }, []);

  return (
    <div className="p-5">
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-8 h-8 rounded-full bg-emerald-600/20 text-emerald-400 inline-flex items-center justify-center">
          ⚡
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold">Form Guide</div>
          {loading ? (
            <div className="mt-2 h-5 w-40 bg-muted/40 rounded animate-pulse" />
          ) : (
            <div className="mt-1 text-sm text-muted-foreground">
              In the last 7 days:
              <span className="font-semibold text-foreground">
                {" "}
                {summary.over25}/{summary.total}
              </span>{" "}
              matches had over 2.5 goals.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LiveResults() {
  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState([]);

  useEffect(() => {
    const fetchLiveMatches = async () => {
      try {
        setLoading(true);
        const { data } = await supabase
          .from("matches")
          .select(
            "id,home_team,away_team,home_score,away_score,status,competition,updated_at"
          )
          .in("status", ["live", "ht"])
          .order("updated_at", { ascending: false })
          .limit(8);

        setMatches(data || []);
      } catch (error) {
        console.error("Error fetching live matches:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchLiveMatches();

    // Refresh every 30 seconds
    const interval = setInterval(fetchLiveMatches, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Live Results</h3>
        <span className="text-xs text-muted-foreground">
          {matches.length} in progress
        </span>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-10 bg-muted/40 rounded animate-pulse" />
          ))}
        </div>
      ) : matches.length === 0 ? (
        <div className="text-center text-muted-foreground text-sm py-8">
          No live matches right now.
        </div>
      ) : (
        <div className="space-y-2">
          {matches.map((match) => (
            <div
              key={match.id}
              className="flex items-center justify-between py-2 px-3 bg-muted/40 rounded hover:bg-muted/60 transition"
            >
              <div className="flex-1">
                <div className="text-sm font-medium">
                  {match.home_team}{" "}
                  <span className="text-muted-foreground">vs</span>{" "}
                  {match.away_team}
                </div>
                <div className="text-xs text-muted-foreground">
                  {match.competition}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs px-2 py-0.5 rounded-full bg-red-600 text-white font-semibold">
                  {match.status === "ht" ? "HT" : "LIVE"}
                </span>
                <span className="font-semibold w-10 text-right">
                  {match.home_score || 0} - {match.away_score || 0}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TopScorers() {
  const [loading, setLoading] = useState(true);
  const [scorers, setScorers] = useState([]);

  useEffect(() => {
    const fetchTopScorers = async () => {
      try {
        setLoading(true);
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        // Get player stats from last 7 days
        const { data: stats } = await supabase
          .from("player_stats")
          .select("player_id,goals")
          .gte("created_at", sevenDaysAgo.toISOString());

        // Group by player and sum goals
        const goalsByPlayer = new Map();
        (stats || []).forEach((stat) => {
          if (stat.player_id && stat.goals) {
            goalsByPlayer.set(
              stat.player_id,
              (goalsByPlayer.get(stat.player_id) || 0) + stat.goals
            );
          }
        });

        // Get top 5 players
        const topPlayerIds = [...goalsByPlayer.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([playerId]) => playerId);

        if (topPlayerIds.length > 0) {
          const { data: players } = await supabase
            .from("players")
            .select("id,full_name")
            .in("id", topPlayerIds);

          const scorersData = topPlayerIds.map((id, index) => ({
            rank: index + 1,
            name:
              (players || []).find((p) => p.id === id)?.full_name || "Unknown",
            goals: goalsByPlayer.get(id) || 0,
          }));

          setScorers(scorersData);
        }
      } catch (error) {
        console.error("Error fetching top scorers:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchTopScorers();
  }, []);

  return (
    <div className="p-5">
      <h3 className="text-sm font-semibold mb-3">Top Scorers (7d)</h3>
      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-10 bg-muted/40 rounded animate-pulse" />
          ))}
        </div>
      ) : scorers.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          No scoring data available.
        </div>
      ) : (
        <div className="space-y-2">
          {scorers.map((scorer) => (
            <div
              key={scorer.rank}
              className="flex items-center justify-between py-2 px-3 bg-muted/40 rounded"
            >
              <div className="flex items-center gap-3">
                <span className="w-6 h-6 inline-flex items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-bold">
                  {scorer.rank}
                </span>
                <span className="text-sm font-medium">{scorer.name}</span>
              </div>
              <span className="text-sm font-semibold">{scorer.goals}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LeagueTable() {
  const [loading, setLoading] = useState(true);
  const [teams, setTeams] = useState([]);

  useEffect(() => {
    const fetchLeagueTable = async () => {
      try {
        setLoading(true);
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        const { data } = await supabase
          .from("matches")
          .select("home_team,away_team,home_score,away_score,status")
          .gte("start_time", thirtyDaysAgo.toISOString())
          .eq("status", "finished");

        // Calculate points
        const teamPoints = new Map();
        (data || []).forEach((match) => {
          const homeScore = match.home_score || 0;
          const awayScore = match.away_score || 0;

          const addPoints = (team, points) => {
            teamPoints.set(team, (teamPoints.get(team) || 0) + points);
          };

          if (homeScore === awayScore) {
            addPoints(match.home_team, 1);
            addPoints(match.away_team, 1);
          } else if (homeScore > awayScore) {
            addPoints(match.home_team, 3);
            addPoints(match.away_team, 0);
          } else {
            addPoints(match.home_team, 0);
            addPoints(match.away_team, 3);
          }
        });

        const teamsData = [...teamPoints.entries()]
          .map(([name, points]) => ({ name, points }))
          .sort((a, b) => b.points - a.points)
          .slice(0, 6);

        setTeams(teamsData);
      } catch (error) {
        console.error("Error fetching league table:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchLeagueTable();
  }, []);

  return (
    <div className="p-5">
      <h3 className="text-sm font-semibold mb-2">League Table (30d, pseudo)</h3>
      {loading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-10 bg-muted/40 rounded animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="divide-y divide-border/50">
          {teams.map((team, idx) => (
            <div
              key={idx}
              className="grid grid-cols-[24px_1fr_56px] items-center py-2 px-3 rounded hover:bg-muted/40"
            >
              <div className="text-xs text-muted-foreground">{idx + 1}</div>
              <div className="truncate text-sm font-medium">{team.name}</div>
              <div className="text-right font-semibold">{team.points}</div>
            </div>
          ))}
        </div>
      )}
      <div className="mt-2 text-xs text-muted-foreground">
        * računa bodove iz završenih utakmica u zadnjih 30 dana.
      </div>
    </div>
  );
}

function XgVsGoals() {
  const [loading, setLoading] = useState(true);
  const [teams, setTeams] = useState([]);

  useEffect(() => {
    const fetchXgData = async () => {
      try {
        setLoading(true);
        const twentyOneDaysAgo = new Date(
          Date.now() - 21 * 24 * 60 * 60 * 1000
        );

        const { data } = await supabase
          .from("matches")
          .select("home_team,away_team,home_score,away_score,status")
          .gte("start_time", twentyOneDaysAgo.toISOString())
          .eq("status", "finished");

        // Calculate team stats
        const teamStats = new Map();
        (data || []).forEach((match) => {
          const updateTeamStats = (team, goals) => {
            const current = teamStats.get(team) || { goals: 0, games: 0 };
            teamStats.set(team, {
              goals: current.goals + goals,
              games: current.games + 1,
            });
          };

          updateTeamStats(match.home_team, match.home_score || 0);
          updateTeamStats(match.away_team, match.away_score || 0);
        });

        // Get top 4 scoring teams
        const topTeams = [...teamStats.entries()]
          .sort((a, b) => b[1].goals - a[1].goals)
          .slice(0, 4)
          .map(([team, stats]) => {
            const avgGoals = stats.goals / stats.games;
            return {
              team,
              actual: avgGoals,
              expected: avgGoals * 0.9, // Simple proxy
            };
          });

        setTeams(topTeams);
      } catch (error) {
        console.error("Error fetching xG data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchXgData();
  }, []);

  return (
    <div className="p-5">
      <h3 className="text-sm font-semibold mb-3">xG vs Actual (proxy)</h3>
      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-14 bg-muted/40 rounded animate-pulse" />
          ))}
        </div>
      ) : teams.length === 0 ? (
        <div className="text-sm text-muted-foreground">No data available.</div>
      ) : (
        <div className="space-y-3">
          {teams.map((team, idx) => {
            const pct = Math.round(
              ((team.actual - team.expected) / team.expected) * 100
            );
            return (
              <div key={idx} className="p-3 bg-muted/40 rounded">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{team.team}</span>
                  <span className="text-xs text-muted-foreground">
                    {pct > 0 ? `+${pct}%` : `${pct}%`}
                  </span>
                </div>
                <div className="mt-2 h-2 w-full bg-muted rounded overflow-hidden">
                  <div
                    className="h-2 bg-primary"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round((team.actual / team.expected) * 50)
                      )}%`,
                    }}
                  />
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Actual: {team.actual.toFixed(2)} • Expected:{" "}
                  {team.expected.toFixed(2)}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="mt-2 text-xs text-muted-foreground">
        * xG proxy je pojednostavljen dok ne dodamo prave xG podatke.
      </div>
    </div>
  );
}

function BestWorstPerformers() {
  const [loading, setLoading] = useState(true);
  const [performers, setPerformers] = useState({ best: [], worst: [] });

  useEffect(() => {
    const fetchPerformers = async () => {
      try {
        setLoading(true);
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        const { data } = await supabase
          .from("matches")
          .select("home_team,away_team,home_score,away_score,status")
          .gte("start_time", sevenDaysAgo.toISOString())
          .eq("status", "finished");

        const teamGoals = new Map();
        (data || []).forEach((match) => {
          const addGoals = (team, goals) => {
            teamGoals.set(team, (teamGoals.get(team) || 0) + goals);
          };

          addGoals(match.home_team, match.home_score || 0);
          addGoals(match.away_team, match.away_score || 0);
        });

        const sorted = [...teamGoals.entries()].sort((a, b) => b[1] - a[1]);

        setPerformers({
          best: sorted.slice(0, 3).map(([team, goals]) => [team, `+${goals}`]),
          worst: sorted
            .slice(-3)
            .reverse()
            .map(([team, goals]) => [team, `-${Math.max(0, goals)}`]),
        });
      } catch (error) {
        console.error("Error fetching performers:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchPerformers();
  }, []);

  return (
    <div className="p-5">
      <h3 className="text-sm font-semibold mb-3">
        Best/Worst Performers (goals, 7d)
      </h3>
      {loading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-10 bg-muted/40 rounded animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-2">
            {performers.best.map(([team, goals], idx) => (
              <div
                key={idx}
                className="flex items-center justify-between px-3 py-2 rounded bg-emerald-600/10"
              >
                <span className="text-sm">{team}</span>
                <span className="text-sm font-semibold text-emerald-400">
                  {goals}
                </span>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            {performers.worst.map(([team, goals], idx) => (
              <div
                key={idx}
                className="flex items-center justify-between px-3 py-2 rounded bg-red-600/10"
              >
                <span className="text-sm">{team}</span>
                <span className="text-sm font-semibold text-red-400">
                  {goals}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ActivityHeatmap() {
  const [loading, setLoading] = useState(true);
  const [hourlyData, setHourlyData] = useState(Array(24).fill(0));

  useEffect(() => {
    const fetchActivity = async () => {
      try {
        setLoading(true);
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        const { data } = await supabase
          .from("matches")
          .select("start_time")
          .gte("start_time", sevenDaysAgo.toISOString());

        const hourCounts = Array(24).fill(0);
        (data || []).forEach((match) => {
          const hour = new Date(match.start_time).getUTCHours();
          hourCounts[hour]++;
        });

        setHourlyData(hourCounts);
      } catch (error) {
        console.error("Error fetching activity heatmap:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchActivity();
  }, []);

  const getLevel = (value) => {
    if (value === 0) return "bg-muted";
    if (value < 3) return "bg-primary/20";
    if (value < 6) return "bg-primary/40";
    return "bg-primary/70";
  };

  return (
    <div className="p-5">
      <h3 className="text-sm font-semibold mb-3">Activity Heatmap (UTC, 7d)</h3>
      {loading ? (
        <div className="grid grid-cols-8 gap-2">
          {[...Array(24)].map((_, i) => (
            <div key={i} className="h-7 rounded bg-muted/40 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-8 gap-2">
          {hourlyData.map((count, hour) => (
            <div
              key={hour}
              className={`h-7 rounded ${getLevel(
                count
              )} text-xs flex items-center justify-center`}
              title={`${hour}:00 - ${count} matches`}
            >
              {count}
            </div>
          ))}
        </div>
      )}
      <div className="mt-2 text-xs text-muted-foreground">
        * koristi UTC satnicu (lakše agregiranje kroz vremenske zone).
      </div>
    </div>
  );
}

// Animated Background Component
function AnimatedBackground() {
  return (
    <div className="fixed inset-0 z-0 overflow-hidden">
      {/* Floating football shapes */}
      <div className="absolute top-10 left-10 w-4 h-4 bg-red-500/20 rounded-full animate-ping animation-delay-1000" />
      <div className="absolute top-32 right-20 w-6 h-6 bg-white/10 rounded-full animate-bounce animation-delay-2000" />
      <div className="absolute bottom-40 left-32 w-5 h-5 bg-red-400/30 rounded-full animate-pulse animation-delay-3000" />
      <div className="absolute bottom-20 right-40 w-3 h-3 bg-white/20 rounded-full animate-ping animation-delay-4000" />

      {/* Moving gradient orbs */}
      <div className="absolute -top-40 -left-40 w-80 h-80 bg-gradient-to-br from-red-500/20 to-transparent rounded-full blur-3xl animate-spin-slow" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-gradient-to-tl from-red-600/15 to-transparent rounded-full blur-3xl animate-pulse" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-gradient-to-r from-red-500/10 to-white/5 rounded-full blur-2xl animate-spin-slow animation-reverse" />
    </div>
  );
}

// Enhanced Card Component
function DashboardCard({ children, className = "", delay = 0 }) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <div
      className={`
        relative bg-card/80 backdrop-blur-sm rounded-2xl shadow-xl border border-border/50 
        transition-all duration-700 ease-out hover:scale-[1.02] hover:shadow-2xl 
        hover:shadow-red-500/10 hover:border-red-500/30 group
        ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}
        ${className}
      `}
    >
      {/* Subtle glow effect on hover */}
      <div className="absolute -inset-0.5 bg-gradient-to-r from-red-500/20 to-white/10 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-sm" />
      <div className="relative">{children}</div>
    </div>
  );
}

// Live Status Indicator
function LiveStatusIndicator() {
  return (
    <div className="flex items-center justify-center mb-8">
      <div className="bg-gradient-to-r from-red-600 to-red-700 text-white px-6 py-3 rounded-full font-semibold text-sm flex items-center gap-3 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105">
        <div className="w-3 h-3 bg-white rounded-full animate-pulse" />
        📊 Analytics Dashboard
        <div className="w-3 h-3 bg-white/70 rounded-full animate-ping" />
      </div>
    </div>
  );
}

// Section Header Component
function SectionHeader({ title, subtitle, icon }) {
  return (
    <div className="text-center mb-8">
      <div className="inline-flex items-center gap-3 mb-2">
        <span className="text-2xl">{icon}</span>
        <h2 className="text-2xl font-bold bg-gradient-to-r from-red-400 via-white to-red-400 bg-clip-text text-transparent">
          {title}
        </h2>
        <span className="text-2xl">{icon}</span>
      </div>
      {subtitle && (
        <p className="text-muted-foreground text-sm max-w-2xl mx-auto">
          {subtitle}
        </p>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Stagger the loading animation
    const timer = setTimeout(() => setIsLoaded(true), 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-red-950 text-white overflow-hidden relative">
      <AnimatedBackground />

      {/* Main Content */}
      <div className="relative z-10">
        {/* Hero Header */}
        <section
          className={`text-center pt-12 pb-8 px-4 transition-all duration-1000 ${
            isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          <div className="mb-6">
            <h1 className="font-black text-5xl md:text-6xl mb-2 text-red-500 animate-pulse-slow">
              Analytics Dashboard
            </h1>
            <p className="text-xl md:text-2xl text-gray-300 font-light tracking-wider">
              Pregled ključnih metrika, trendova i live podataka
            </p>
          </div>
          <LiveStatusIndicator />
        </section>

        <div className="container mx-auto px-6 pb-12 space-y-12">
          {/* Quick Stats - Hero Section */}
          <DashboardCard delay={200} className="p-2">
            <QuickStats />
          </DashboardCard>

          {/* Insights Section */}
          <section>
            <SectionHeader
              title="Trenutni Insights"
              subtitle="Najažurniji podaci o performansama i trending statistike"
              icon="🔥"
            />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <DashboardCard delay={300}>
                <StatOfTheDay />
              </DashboardCard>
              <DashboardCard delay={400}>
                <UpsetAlert />
              </DashboardCard>
              <DashboardCard delay={500}>
                <FormGuide />
              </DashboardCard>
            </div>
          </section>

          {/* Live Data Section */}
          <section>
            <SectionHeader
              title="Live Praćenje"
              subtitle="Utakmice u tijeku i top performeri"
              icon="⚡"
            />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <DashboardCard delay={600} className="lg:col-span-2">
                <LiveResults />
              </DashboardCard>
              <DashboardCard delay={700}>
                <TopScorers />
              </DashboardCard>
            </div>
          </section>

          {/* Performance Analytics */}
          <section>
            <SectionHeader
              title="Performance Analytics"
              subtitle="Dubinska analiza rezultata i očekivanih performansi"
              icon="📈"
            />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <DashboardCard delay={800}>
                <LeagueTable />
              </DashboardCard>
              <DashboardCard delay={900}>
                <XgVsGoals />
              </DashboardCard>
            </div>
          </section>

          {/* Advanced Metrics */}
          <section>
            <SectionHeader
              title="Napredne Metrike"
              subtitle="Detaljne analize performansi i aktivnost kroz vrijeme"
              icon="🎯"
            />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <DashboardCard delay={1000}>
                <BestWorstPerformers />
              </DashboardCard>
              <DashboardCard delay={1100}>
                <ActivityHeatmap />
              </DashboardCard>
            </div>
          </section>

          {/* Footer Call to Action */}
          <section className="text-center py-16 px-6">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-3xl md:text-4xl font-bold mb-4 bg-gradient-to-r from-red-400 via-white to-red-400 bg-clip-text text-transparent">
                Potrebna Dublja Analiza?
              </h2>
              <p className="text-lg text-gray-300 mb-8">
                Istražite detaljne statistike utakmica, igrača i timova
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button className="px-8 py-4 bg-gradient-to-r from-red-600 to-red-700 rounded-full font-semibold text-lg transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-red-500/30">
                  Pregled Utakmica
                </button>
                <button className="px-8 py-4 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-full font-semibold text-lg border border-white/20 transition-all duration-300 hover:scale-105">
                  Analiza Igrača
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>

      <style jsx>{`
        .animate-pulse-slow {
          animation: pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }

        .animate-spin-slow {
          animation: spin 20s linear infinite;
        }

        .animation-reverse {
          animation-direction: reverse;
        }

        .animation-delay-1000 {
          animation-delay: 1s;
        }

        .animation-delay-2000 {
          animation-delay: 2s;
        }

        .animation-delay-3000 {
          animation-delay: 3s;
        }

        .animation-delay-4000 {
          animation-delay: 4s;
        }

        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
