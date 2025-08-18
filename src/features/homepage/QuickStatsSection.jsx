// src/features/homepage/QuickStatsSection.jsx
// ============================================
import React, { useState, useEffect } from "react";
import supabase from "../../services/supabase";
import Card3D from "./Card3D";
import AnimatedCounter from "./AnimatedCounter";

export default function QuickStatsSection() {
  const [stats, setStats] = useState({
    liveMatches: 0,
    todayAnalyses: 0,
    predictions: 0,
    accuracy: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        // 1. Live utakmice
        const { count: liveCount } = await supabase
          .from("matches")
          .select("*", { count: "exact", head: true })
          .in("status", ["live", "ht"]);

        // 2. Današnje analize/utakmice
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const { count: todayCount } = await supabase
          .from("matches")
          .select("*", { count: "exact", head: true })
          .gte("start_time", today.toISOString())
          .lt("start_time", tomorrow.toISOString());

        // 3. Broj predikcija (možeš prilagoditi logiku)
        const { count: totalMatches } = await supabase
          .from("matches")
          .select("*", { count: "exact", head: true })
          .eq("status", "scheduled");

        // 4. Točnost (simulirano ili iz tvoje logike)
        const accuracy = 89; // Možeš izračunati iz stvarnih podataka

        setStats({
          liveMatches: liveCount || 0,
          todayAnalyses: todayCount || 0,
          predictions: totalMatches || 0,
          accuracy: accuracy,
        });
      } catch (error) {
        console.error("Error fetching stats:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  const statCards = [
    {
      title: "Live Utakmice",
      value: stats.liveMatches,
      icon: "🔴",
      color: "from-red-500 to-red-600",
    },
    {
      title: "Današnje Utakmice",
      value: stats.todayAnalyses,
      icon: "📊",
      color: "from-blue-500 to-blue-600",
    },
    {
      title: "Predstojeće",
      value: stats.predictions,
      icon: "⚡",
      color: "from-yellow-500 to-yellow-600",
    },
    {
      title: "Točnost",
      value: stats.accuracy,
      suffix: "%",
      icon: "📈",
      color: "from-green-500 to-green-600",
    },
  ];

  return (
    <section className="relative z-10 px-6 py-16">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat, i) => (
          <Card3D key={i}>
            <div className="relative p-6 bg-black/40 backdrop-blur-md rounded-2xl border border-white/10 hover:border-red-500/50 transition-all duration-300">
              <div
                className={`absolute inset-0 bg-gradient-to-br ${stat.color} opacity-5 rounded-2xl`}
              />
              <div className="relative">
                <div className="text-3xl mb-3">{stat.icon}</div>
                <div className="text-4xl font-bold mb-2 text-white">
                  {loading ? (
                    <span className="text-2xl">...</span>
                  ) : (
                    <AnimatedCounter end={stat.value} suffix={stat.suffix} />
                  )}
                </div>
                <div className="text-sm text-gray-400">{stat.title}</div>
              </div>
            </div>
          </Card3D>
        ))}
      </div>
    </section>
  );
}
