// src/features/dashboard/StatOfTheDay.jsx
import { useEffect, useState } from "react";
import supabase from "../../services/supabase";

export default function StatOfTheDay() {
  const [loading, setLoading] = useState(true);
  const [stat, setStat] = useState(null);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      const since = new Date(
        Date.now() - 7 * 24 * 60 * 60 * 1000
      ).toISOString();
      const { data } = await supabase
        .from("matches")
        .select("home_team,away_team,home_score,away_score,start_time")
        .gte("start_time", since)
        .order("start_time", { ascending: false })
        .limit(200);

      const rows = data || [];
      let best = null;
      rows.forEach((m) => {
        const goals = (m.home_score ?? 0) + (m.away_score ?? 0);
        if (!best || goals > best.goals)
          best = { teams: `${m.home_team} vs ${m.away_team}`, goals };
      });
      setStat(best);
      setLoading(false);
    };
    run();
  }, []);

  return (
    <div className="p-5 bg-card rounded-2xl shadow border border-border/50">
      <div className="text-sm font-semibold">Stat of the Day</div>
      {loading ? (
        <div className="mt-2 h-5 w-52 bg-muted/40 rounded animate-pulse" />
      ) : stat ? (
        <div className="mt-1 text-sm text-muted-foreground">
          Highest scoring match (7d):{" "}
          <span className="font-semibold text-foreground">{stat.teams}</span>{" "}
          with{" "}
          <span className="font-semibold text-foreground">{stat.goals}</span>{" "}
          total goals.
        </div>
      ) : (
        <div className="mt-1 text-sm text-muted-foreground">No data.</div>
      )}
    </div>
  );
}
