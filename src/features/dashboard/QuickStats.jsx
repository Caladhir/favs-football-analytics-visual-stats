// src/features/dashboard/QuickStats.jsx
import { useEffect, useState } from "react";
import supabase from "../../services/supabase";

function StatCard({ title, value, sub }) {
  return (
    <div className="p-5 bg-card rounded-2xl shadow border border-border/50">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      <div className="mt-2 text-3xl font-bold">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

export default function QuickStats() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [stats, setStats] = useState({
    matchesToday: 0,
    avgGoals7d: 0,
    activePlayers7d: 0,
  });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setErr("");
        setLoading(true);
        const now = new Date();
        const start = new Date(
          Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate(),
            0,
            0,
            0
          )
        );
        const end = new Date(
          Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate(),
            23,
            59,
            59
          )
        );

        // 1) Matches today (exact count via head:true)
        const { count: matchesToday } = await supabase
          .from("matches")
          .select("id", { count: "exact", head: true })
          .gte("start_time", start.toISOString())
          .lt("start_time", end.toISOString());

        // 2) Avg goals (last 7 days)
        const sevenAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const { data: weekMatches } = await supabase
          .from("matches")
          .select("home_score,away_score,start_time")
          .gte("start_time", sevenAgo.toISOString());
        const goals = (weekMatches || []).map(
          (m) => (m.home_score ?? 0) + (m.away_score ?? 0)
        );
        const avgGoals7d = goals.length
          ? (goals.reduce((a, b) => a + b, 0) / goals.length).toFixed(2)
          : 0;

        // 3) Active players (distinct players with stats in last 7 days)
        const { data: recentStats } = await supabase
          .from("player_stats")
          .select("player_id, created_at")
          .gte("created_at", sevenAgo.toISOString());
        const distinct = new Set(
          (recentStats || []).map((r) => r.player_id).filter(Boolean)
        );

        setStats({
          matchesToday: matchesToday || 0,
          avgGoals7d: Number(avgGoals7d),
          activePlayers7d: distinct.size,
        });
      } catch (e) {
        setErr(e.message || "Failed to load stats");
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
          <div key={i} className="p-5 bg-card rounded-2xl animate-pulse h-24" />
        ))}
      </div>
    );
  }

  if (err) {
    return (
      <div className="p-4 bg-destructive/10 text-destructive rounded">
        {err}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <StatCard title="Total Matches (today)" value={stats.matchesToday} />
      <StatCard title="Avg Goals (7d)" value={stats.avgGoals7d} />
      <StatCard
        title="Active Players (7d)"
        value={`${stats.activePlayers7d}+`}
      />
    </div>
  );
}
