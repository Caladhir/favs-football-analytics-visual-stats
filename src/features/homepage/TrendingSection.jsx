// src/features/homepage/TrendingSection.jsx - ENHANCED WITH BETTER STYLING & ENGLISH
import React, { useState, useEffect } from "react";
import supabase from "../../services/supabase";
import GlowingText from "./GlowingText";

export default function TrendingSection() {
  const [players, setPlayers] = useState([]);
  const [predictions, setPredictions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTrendingData = async () => {
      try {
        // 1. Top scorers from last 7 days
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const { data: statsData } = await supabase
          .from("player_stats")
          .select(
            `
            player_id,
            goals,
            assists,
            created_at,
            players!inner(
              id,
              full_name,
              team
            )
          `
          )
          .gte("created_at", sevenDaysAgo.toISOString())
          .order("goals", { ascending: false })
          .limit(3);

        if (statsData && statsData.length > 0) {
          const formattedPlayers = statsData.map((stat, index) => ({
            name: stat.players?.full_name || `Player ${index + 1}`,
            goals: stat.goals || 0,
            assists: stat.assists || 0,
            team: stat.players?.team || "Unknown",
            trend: stat.goals > 2 ? `+${stat.goals}` : `${stat.goals}`,
          }));
          setPlayers(formattedPlayers);
        } else {
          // Enhanced fallback data
          setPlayers([
            {
              name: "Erling Haaland",
              goals: 5,
              assists: 2,
              team: "Man City",
              trend: "+5",
            },
            {
              name: "Kylian Mbappé",
              goals: 4,
              assists: 3,
              team: "Real Madrid",
              trend: "+4",
            },
            {
              name: "Robert Lewandowski",
              goals: 3,
              assists: 1,
              team: "Barcelona",
              trend: "+3",
            },
          ]);
        }

        // 2. Upcoming matches for predictions
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const nextWeek = new Date();
        nextWeek.setDate(nextWeek.getDate() + 7);

        const { data: matchesData } = await supabase
          .from("matches")
          .select("id, home_team, away_team, start_time, competition_id")
          .eq("status", "scheduled")
          .gte("start_time", tomorrow.toISOString())
          .lt("start_time", nextWeek.toISOString())
          .order("start_time", { ascending: true })
          .limit(3);

        if (matchesData && matchesData.length > 0) {
          const formattedPredictions = matchesData.map((match) => {
            // Enhanced prediction simulation with more realistic logic
            const isTopTeam = (teamName) => {
              const topTeams = [
                "Real Madrid",
                "Barcelona",
                "Man City",
                "Liverpool",
                "Bayern",
                "PSG",
                "Arsenal",
                "Chelsea",
              ];
              return topTeams.some((team) =>
                teamName.toLowerCase().includes(team.toLowerCase())
              );
            };

            const homeIsTop = isTopTeam(match.home_team);
            const awayIsTop = isTopTeam(match.away_team);

            let homeWin, draw, awayWin;

            if (homeIsTop && !awayIsTop) {
              homeWin = Math.floor(Math.random() * 20) + 60; // 60-80%
              awayWin = Math.floor(Math.random() * 15) + 10; // 10-25%
              draw = 100 - homeWin - awayWin;
            } else if (!homeIsTop && awayIsTop) {
              awayWin = Math.floor(Math.random() * 20) + 50; // 50-70%
              homeWin = Math.floor(Math.random() * 20) + 15; // 15-35%
              draw = 100 - homeWin - awayWin;
            } else {
              homeWin = Math.floor(Math.random() * 30) + 35;
              awayWin = Math.floor(Math.random() * 30) + 25;
              draw = 100 - homeWin - awayWin;
            }

            const maxProb = Math.max(homeWin, draw, awayWin);
            const prediction =
              maxProb === homeWin
                ? { result: "1", prob: homeWin }
                : maxProb === awayWin
                ? { result: "2", prob: awayWin }
                : { result: "X", prob: draw };

            const confidence =
              prediction.prob > 60
                ? "High"
                : prediction.prob > 45
                ? "Medium"
                : "Low";
            const odds = (100 / prediction.prob).toFixed(2);

            return {
              match: `${match.home_team} vs ${match.away_team}`,
              prediction: `${prediction.result} (${prediction.prob}%)`,
              confidence,
              odds,
              date: new Date(match.start_time).toLocaleDateString(),
            };
          });
          setPredictions(formattedPredictions);
        } else {
          // Enhanced fallback data
          setPredictions([
            {
              match: "Man City vs Arsenal",
              prediction: "1 (65%)",
              confidence: "High",
              odds: "1.54",
              date: "Tomorrow",
            },
            {
              match: "Barcelona vs Real Madrid",
              prediction: "X (40%)",
              confidence: "Medium",
              odds: "2.50",
              date: "This Weekend",
            },
            {
              match: "Liverpool vs Chelsea",
              prediction: "1 (58%)",
              confidence: "Medium",
              odds: "1.72",
              date: "Next Week",
            },
          ]);
        }
      } catch (error) {
        console.error("Error fetching trending data:", error);
        // Set enhanced fallback data
        setPlayers([
          {
            name: "Erling Haaland",
            goals: 5,
            assists: 2,
            team: "Man City",
            trend: "+5",
          },
          {
            name: "Kylian Mbappé",
            goals: 4,
            assists: 3,
            team: "Real Madrid",
            trend: "+4",
          },
          {
            name: "Robert Lewandowski",
            goals: 3,
            assists: 1,
            team: "Barcelona",
            trend: "+3",
          },
        ]);
        setPredictions([
          {
            match: "Man City vs Arsenal",
            prediction: "1 (65%)",
            confidence: "High",
            odds: "1.54",
            date: "Tomorrow",
          },
          {
            match: "Barcelona vs Real Madrid",
            prediction: "X (40%)",
            confidence: "Medium",
            odds: "2.50",
            date: "This Weekend",
          },
          {
            match: "Liverpool vs Chelsea",
            prediction: "1 (58%)",
            confidence: "Medium",
            odds: "1.72",
            date: "Next Week",
          },
        ]);
      } finally {
        setLoading(false);
      }
    };

    fetchTrendingData();
  }, []);

  return (
    <section className="relative z-10 py-16 px-6 -mx-6">
      <div className="bg-gradient-to-r from-red-950/30 via-gray-900/50 to-red-950/30 backdrop-blur-sm border-y border-red-500/20">
        <div className="container mx-auto max-w-7xl py-16">
          {/* Section Header */}
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              <GlowingText>🔥 Trending Now</GlowingText>
            </h2>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              Hottest players and most anticipated predictions this week
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* Top Players Section */}
            <div className="group">
              <div className="relative p-8 bg-gradient-to-br from-gray-800/60 to-gray-900/80 backdrop-blur-lg rounded-3xl border border-red-500/20 hover:border-red-500/40 transition-all duration-300 hover:scale-[1.02]">
                <div className="flex items-center mb-8">
                  <div className="text-4xl mr-4">🏆</div>
                  <div>
                    <h3 className="text-2xl md:text-3xl font-bold text-white mb-2">
                      Top Scorers
                    </h3>
                    <p className="text-gray-400">Last 7 days performance</p>
                  </div>
                </div>

                {loading ? (
                  <div className="space-y-6">
                    {[1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="h-20 bg-white/5 rounded-xl animate-pulse"
                      />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-6">
                    {players.map((player, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-6 bg-white/5 hover:bg-white/10 rounded-xl transition-all duration-300 group/item"
                      >
                        <div className="flex items-center">
                          {/* Position badge */}
                          <div
                            className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-white text-lg ${
                              index === 0
                                ? "bg-gradient-to-r from-yellow-500 to-yellow-600"
                                : index === 1
                                ? "bg-gradient-to-r from-gray-400 to-gray-500"
                                : "bg-gradient-to-r from-amber-600 to-amber-700"
                            }`}
                          >
                            {index + 1}
                          </div>

                          <div className="ml-6">
                            <div className="font-semibold text-white text-lg group-hover/item:text-red-400 transition-colors">
                              {player.name}
                            </div>
                            <div className="text-sm text-gray-400">
                              {player.team}
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="font-bold text-red-400 text-xl">
                            {player.goals} goals
                          </div>
                          {player.assists > 0 && (
                            <div className="text-sm text-gray-400">
                              {player.assists} assists
                            </div>
                          )}
                          <div className="text-xs text-green-400 font-semibold bg-green-400/20 px-2 py-1 rounded-full mt-1">
                            {player.trend}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Hot Predictions Section */}
            <div className="group">
              <div className="relative p-8 bg-gradient-to-br from-gray-800/60 to-gray-900/80 backdrop-blur-lg rounded-3xl border border-red-500/20 hover:border-red-500/40 transition-all duration-300 hover:scale-[1.02]">
                <div className="flex items-center mb-8">
                  <div className="text-4xl mr-4">🎯</div>
                  <div>
                    <h3 className="text-2xl md:text-3xl font-bold text-white mb-2">
                      Hot Predictions
                    </h3>
                    <p className="text-gray-400">AI-powered match forecasts</p>
                  </div>
                </div>

                {loading ? (
                  <div className="space-y-6">
                    {[1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="h-24 bg-white/5 rounded-xl animate-pulse"
                      />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-6">
                    {predictions.map((pred, index) => (
                      <div
                        key={index}
                        className="p-6 bg-white/5 hover:bg-white/10 rounded-xl transition-all duration-300 group/item"
                      >
                        <div className="flex justify-between items-start mb-4">
                          <div className="font-semibold text-white text-lg group-hover/item:text-red-400 transition-colors">
                            {pred.match}
                          </div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-xs px-3 py-1 rounded-full font-semibold ${
                                pred.confidence === "High"
                                  ? "bg-green-500/20 text-green-400"
                                  : pred.confidence === "Medium"
                                  ? "bg-yellow-500/20 text-yellow-400"
                                  : "bg-red-500/20 text-red-400"
                              }`}
                            >
                              {pred.confidence}
                            </span>
                            <span className="text-xs px-2 py-1 bg-red-500/20 text-red-400 rounded">
                              HOT
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <span className="text-gray-400 block">
                              Prediction
                            </span>
                            <span className="font-bold text-white">
                              {pred.prediction}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-400 block">Odds</span>
                            <span className="font-bold text-green-400">
                              {pred.odds}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-400 block">Date</span>
                            <span className="font-bold text-blue-400">
                              {pred.date}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
