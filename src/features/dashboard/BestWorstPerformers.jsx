// src/features/dashboard/BestWorstPerformers.jsx
import { useEffect, useState } from "react";
import supabase from "../../services/supabase";

function Line({ label, value, good }) {
  return (
    <div
      className={`flex items-center justify-between px-3 py-2 rounded ${
        good ? "bg-emerald-600/10" : "bg-red-600/10"
      }`}
    >
      <span className="text-sm">{label}</span>
      <span
        className={`text-sm font-semibold ${
          good ? "text-emerald-400" : "text-red-400"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

export default function BestWorstPerformers() {
  const [loading, setLoading] = useState(true);
  const [best, setBest] = useState([]);
  const [worst, setWorst] = useState([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const since = new Date(
        Date.now() - 7 * 24 * 60 * 60 * 1000
      ).toISOString();
      const { data } = await supabase
        .from("matches")
        .select("home_team,away_team,home_score,away_score,status,start_time")
        .gte("start_time", since)
        .eq("status", "finished");

      const goalsFor = new Map();
      const add = (team, g) =>
        goalsFor.set(team, (goalsFor.get(team) || 0) + g);
      (data || []).forEach((m) => {
        add(m.home_team, m.home_score ?? 0);
        add(m.away_team, m.away_score ?? 0);
      });

      const ordered = [...goalsFor.entries()].sort((a, b) => b[1] - a[1]);
      setBest(ordered.slice(0, 3));
      setWorst(ordered.slice(-3).reverse());
      setLoading(false);
    };
    load();
  }, []);

  return (
    <div className="p-5 bg-card rounded-2xl shadow border border-border/50">
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
            {best.map(([t, g]) => (
              <Line key={t} label={t} value={`+${g}`} good />
            ))}
          </div>
          <div className="space-y-2">
            {worst.map(([t, g]) => (
              <Line
                key={t}
                label={t}
                value={`-${Math.max(0, g)}`}
                good={false}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
