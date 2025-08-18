// src/features/homepage/TrendingSection.jsx
// ============================================
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
        // 1. Top strijelci - iz player_stats
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
            name: stat.players?.full_name || `Igrač ${index + 1}`,
            goals: stat.goals || 0,
            team: stat.players?.team || "",
          }));
          setPlayers(formattedPlayers);
        } else {
          // Fallback podaci ako nema u bazi
          setPlayers([
            { name: "Bruno Petković", goals: 8, team: "Dinamo" },
            { name: "Marko Livaja", goals: 7, team: "Hajduk" },
            { name: "Mislav Oršić", goals: 6, team: "Dinamo" },
          ]);
        }

        // 2. Predstojeće utakmice za predikcije
        const { data: matchesData } = await supabase
          .from("matches")
          .select("id, home_team, away_team, start_time")
          .eq("status", "scheduled")
          .order("start_time", { ascending: true })
          .limit(3);

        if (matchesData && matchesData.length > 0) {
          const formattedPredictions = matchesData.map((match) => {
            // Simuliraj predikcije (možeš zamijeniti s pravom logikom)
            const homeWin = Math.floor(Math.random() * 40) + 30;
            const draw = Math.floor(Math.random() * 30) + 20;
            const awayWin = 100 - homeWin - draw;

            const prediction =
              homeWin > awayWin
                ? `1 (${homeWin}%)`
                : awayWin > homeWin
                ? `2 (${awayWin}%)`
                : `X (${draw}%)`;

            const odds = (Math.random() * 2 + 1.5).toFixed(2);

            return {
              match: `${match.home_team} - ${match.away_team}`,
              prediction,
              odds,
            };
          });
          setPredictions(formattedPredictions);
        } else {
          // Fallback podaci
          setPredictions([
            { match: "Dinamo - Hajduk", prediction: "1 (65%)", odds: "1.85" },
            { match: "Rijeka - Osijek", prediction: "X (40%)", odds: "3.20" },
            {
              match: "Lokomotiva - Gorica",
              prediction: "2 (55%)",
              odds: "2.40",
            },
          ]);
        }
      } catch (error) {
        console.error("Error fetching trending data:", error);
        // Postavi fallback podatke u slučaju greške
        setPlayers([
          { name: "Bruno Petković", goals: 8, team: "Dinamo" },
          { name: "Marko Livaja", goals: 7, team: "Hajduk" },
          { name: "Mislav Oršić", goals: 6, team: "Dinamo" },
        ]);
        setPredictions([
          { match: "Dinamo - Hajduk", prediction: "1 (65%)", odds: "1.85" },
          { match: "Rijeka - Osijek", prediction: "X (40%)", odds: "3.20" },
          { match: "Lokomotiva - Gorica", prediction: "2 (55%)", odds: "2.40" },
        ]);
      } finally {
        setLoading(false);
      }
    };

    fetchTrendingData();
  }, []);

  return (
    <section className="relative z-10 px-6 py-16 bg-gradient-to-t from-black/60 to-transparent">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-4xl font-bold text-center mb-12">
          <GlowingText>Trending Sada</GlowingText>
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Top Players */}
          <div className="p-6 bg-black/40 backdrop-blur-lg rounded-2xl border border-red-500/20">
            <h3 className="text-2xl font-bold mb-6 flex items-center text-white">
              <span className="mr-3">🔥</span> Top Strijelci (7 dana)
            </h3>
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-16 bg-white/5 rounded-lg animate-pulse"
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {players.map((player, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-4 bg-white/5 rounded-lg hover:bg-white/10 transition-colors duration-300"
                  >
                    <div className="flex items-center">
                      <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-red-600 rounded-full flex items-center justify-center font-bold text-white">
                        {i + 1}
                      </div>
                      <div className="ml-4">
                        <span className="font-medium text-white block">
                          {player.name}
                        </span>
                        {player.team && (
                          <span className="text-xs text-gray-400">
                            {player.team}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-red-400 font-bold">
                      {player.goals} golova
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Hot Predictions */}
          <div className="p-6 bg-black/40 backdrop-blur-lg rounded-2xl border border-red-500/20">
            <h3 className="text-2xl font-bold mb-6 flex items-center text-white">
              <span className="mr-3">⚡</span> Vruće Predikcije
            </h3>
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-20 bg-white/5 rounded-lg animate-pulse"
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {predictions.map((pred, i) => (
                  <div
                    key={i}
                    className="p-4 bg-white/5 rounded-lg hover:bg-white/10 transition-colors duration-300"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-medium text-white">
                        {pred.match}
                      </span>
                      <span className="text-xs px-2 py-1 bg-red-500/20 text-red-400 rounded">
                        HOT
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">
                        Predikcija:{" "}
                        <span className="text-white font-bold">
                          {pred.prediction}
                        </span>
                      </span>
                      <span className="text-gray-400">
                        Koef:{" "}
                        <span className="text-green-400 font-bold">
                          {pred.odds}
                        </span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
