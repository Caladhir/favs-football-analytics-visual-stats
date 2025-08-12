// src/features/dashboard/XgVsGoals.jsx
import { useEffect, useState } from "react";
import supabase from "../../services/supabase";

function Bar({ label, actual, expected }) {
  const pct = Math.max(
    0,
    Math.min(100, Math.round(((actual - expected) / (expected || 1)) * 100))
  );
  return (
    <div className="p-3 bg-muted/40 rounded">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium truncate">{label}</span>
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
              Math.round((actual / (expected || 1)) * 50)
            )}%`,
          }}
        />
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">
        Actual: {actual.toFixed(2)} • Expected (proxy): {expected.toFixed(2)}
      </div>
    </div>
  );
}

export default function XgVsGoals() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      const since = new Date(
        Date.now() - 21 * 24 * 60 * 60 * 1000
      ).toISOString();
      const { data: matches } = await supabase
        .from("matches")
        .select("home_team,away_team,home_score,away_score,start_time,status")
        .gte("start_time", since);

      const teamGoals = new Map();
      const teamGames = new Map();
      (matches || []).forEach((m) => {
        const hs = m.home_score ?? 0;
        const as = m.away_score ?? 0;
        const push = (name, g) => {
          teamGoals.set(name, (teamGoals.get(name) || 0) + g);
          teamGames.set(name, (teamGames.get(name) || 0) + 1);
        };
        push(m.home_team, hs);
        push(m.away_team, as);
      });

      // Build top 4 by total goals and compute simple xG proxy = team average goals over 21d
      const topTeams = [...teamGoals.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([name]) => name);

      const rows = topTeams.map((t) => {
        const totalGoals = teamGoals.get(t) || 0;
        const games = teamGames.get(t) || 1;
        const actual = totalGoals / games; // avg goals per game last 21d
        const expected = (totalGoals / games) * 0.9; // simple baseline proxy (90%)
        return { team: t, actual, expected };
      });

      setRows(rows);
      setLoading(false);
    };
    run();
  }, []);

  return (
    <div className="p-5 bg-card rounded-2xl shadow border border-border/50">
      <h3 className="text-sm font-semibold mb-3">xG vs Actual (proxy)</h3>
      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-14 bg-muted/40 rounded animate-pulse" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-muted-foreground">No data.</div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <Bar
              key={r.team}
              label={r.team}
              actual={r.actual}
              expected={r.expected}
            />
          ))}
        </div>
      )}
      <div className="mt-2 text-[11px] text-muted-foreground">
        * xG proxy je pojednostavljen dok ne dodamo prave xG podatke.
      </div>
    </div>
  );
}
