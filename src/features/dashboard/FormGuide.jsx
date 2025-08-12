// src/features/dashboard/FormGuide.jsx
import { useEffect, useState } from "react";
import supabase from "../../services/supabase";

export default function FormGuide() {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({ count: 0, over25: 0 });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const since = new Date(
        Date.now() - 7 * 24 * 60 * 60 * 1000
      ).toISOString();
      const { data } = await supabase
        .from("matches")
        .select("home_score, away_score, start_time")
        .gte("start_time", since)
        .order("start_time", { ascending: false });

      const rows = data || [];
      const count = rows.length;
      const over25 = rows.filter(
        (m) => (m.home_score ?? 0) + (m.away_score ?? 0) > 2
      ).length;
      setSummary({ count, over25 });
      setLoading(false);
    };
    load();
  }, []);

  return (
    <div className="p-5 bg-card rounded-2xl shadow border border-border/50">
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-8 h-8 rounded-full bg-emerald-600/20 text-emerald-400 inline-flex items-center justify-center">
          ⚡
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold">Form Guide</div>
          {loading ? (
            <div className="mt-2 h-5 w-40 bg-muted/40 rounded animate-pulse" />
          ) : (
            <div className="mt-1 text-sm text-muted-foreground">
              In the last 7 days:{" "}
              <span className="font-semibold text-foreground">
                {summary.over25}/{summary.count}
              </span>{" "}
              matches had over 2.5 goals.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
