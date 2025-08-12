// src/features/dashboard/LiveResults.jsx
import { useEffect, useState } from "react";
import supabase from "../../services/supabase";

function Row({ m }) {
  const total = (m.home_score ?? 0) + (m.away_score ?? 0);
  const badge = m.status === "ht" ? "HT" : "LIVE";
  return (
    <div className="flex items-center justify-between py-2 px-3 bg-muted/40 rounded hover:bg-muted/60 transition">
      <div className="flex-1 truncate">
        <div className="text-sm font-medium truncate">
          {m.home_team} <span className="text-muted-foreground">vs</span>{" "}
          {m.away_team}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {m.competition || ""}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs px-2 py-0.5 rounded-full bg-red-600 text-white font-semibold">
          {badge}
        </span>
        <span className="font-semibold w-10 text-right">
          {m.home_score ?? 0} - {m.away_score ?? 0}
        </span>
      </div>
    </div>
  );
}

export default function LiveResults() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("matches")
        .select(
          "id,home_team,away_team,home_score,away_score,status,competition,updated_at"
        )
        .in("status", ["live", "ht"]) // normalized live statuses
        .order("updated_at", { ascending: false })
        .limit(8);
      setRows(data || []);
      setLoading(false);
    };
    load();

    // Refresh every 30s while component is mounted
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="p-5 bg-card rounded-2xl shadow border border-border/50">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Live Results</h3>
        <span className="text-xs text-muted-foreground">
          {rows.length} in progress
        </span>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-10 bg-muted/40 rounded animate-pulse" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center text-muted-foreground text-sm py-8">
          No live matches right now.
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((m) => (
            <Row key={m.id} m={m} />
          ))}
        </div>
      )}
    </div>
  );
}
