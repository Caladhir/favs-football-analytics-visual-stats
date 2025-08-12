// src/features/dashboard/TopScorers.jsx
import { useEffect, useMemo, useState } from "react";
import supabase from "../../services/supabase";

function Item({ rank, name, goals }) {
  return (
    <div className="flex items-center justify-between py-2 px-3 bg-muted/40 rounded">
      <div className="flex items-center gap-3">
        <span className="w-6 h-6 inline-flex items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-bold">
          {rank}
        </span>
        <span className="text-sm font-medium">{name}</span>
      </div>
      <span className="text-sm font-semibold">{goals}</span>
    </div>
  );
}

export default function TopScorers() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      const since = new Date(
        Date.now() - 7 * 24 * 60 * 60 * 1000
      ).toISOString();
      const { data: stats } = await supabase
        .from("player_stats")
        .select("player_id, goals, created_at")
        .gte("created_at", since);

      const goalsByPlayer = new Map();
      (stats || []).forEach((r) => {
        if (!r.player_id) return;
        goalsByPlayer.set(
          r.player_id,
          (goalsByPlayer.get(r.player_id) || 0) + (r.goals || 0)
        );
      });
      const topIds = [...goalsByPlayer.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([id]) => id);

      let players = [];
      if (topIds.length) {
        const { data: p } = await supabase
          .from("players")
          .select("id, full_name")
          .in("id", topIds);
        players = p || [];
      }

      const rows = topIds.map((id) => ({
        id,
        name: players.find((x) => x.id === id)?.full_name || "Unknown",
        goals: goalsByPlayer.get(id) || 0,
      }));
      setRows(rows);
      setLoading(false);
    };
    run();
  }, []);

  return (
    <div className="p-5 bg-card rounded-2xl shadow border border-border/50">
      <h3 className="text-sm font-semibold mb-3">Top Scorers (7d)</h3>
      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-10 bg-muted/40 rounded animate-pulse" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-muted-foreground">No data yet.</div>
      ) : (
        <div className="space-y-2">
          {rows.map((r, i) => (
            <Item key={r.id} rank={i + 1} name={r.name} goals={r.goals} />
          ))}
        </div>
      )}
    </div>
  );
}
