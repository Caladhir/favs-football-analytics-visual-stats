// src/features/dashboard/UpsetAlert.jsx
import { useEffect, useState } from "react";
import supabase from "../../services/supabase";

export default function UpsetAlert() {
  const [loading, setLoading] = useState(true);
  const [match, setMatch] = useState(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const since = new Date(
        Date.now() - 7 * 24 * 60 * 60 * 1000
      ).toISOString();
      const { data } = await supabase
        .from("matches")
        .select(
          "home_team,away_team,home_score,away_score,competition,start_time,status"
        )
        .eq("status", "finished")
        .gte("start_time", since)
        .order("start_time", { ascending: false })
        .limit(300);

      const rows = data || [];
      // Upset heuristic: away win by >=2 goals
      const upset = rows.find(
        (m) => (m.away_score ?? 0) - (m.home_score ?? 0) >= 2
      );
      setMatch(upset || rows[0] || null);
      setLoading(false);
    };
    load();
  }, []);

  return (
    <div className="p-5 bg-card rounded-2xl shadow border border-border/50">
      <div className="text-sm font-semibold">Upset Alert</div>
      {loading ? (
        <div className="mt-2 h-5 w-60 bg-muted/40 rounded animate-pulse" />
      ) : match ? (
        <div className="mt-1 text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">
            {match.away_team}
          </span>{" "}
          shocked{" "}
          <span className="font-semibold text-foreground">
            {match.home_team}
          </span>{" "}
          in {match.competition || "recent match"} — {match.away_score}:
          {match.home_score}
        </div>
      ) : (
        <div className="mt-1 text-sm text-muted-foreground">
          No recent upsets detected.
        </div>
      )}
    </div>
  );
}
