// src/features/dashboard/ActivityHeatmap.jsx
import { useEffect, useState } from "react";
import supabase from "../../services/supabase";

function Cell({ label, value }) {
  const level =
    value === 0
      ? "bg-muted"
      : value < 3
      ? "bg-primary/20"
      : value < 6
      ? "bg-primary/40"
      : "bg-primary/70";
  return (
    <div
      className={`h-7 rounded ${level} text-[11px] flex items-center justify-center`}
      title={`${label}: ${value}`}
    >
      {value}
    </div>
  );
}

export default function ActivityHeatmap() {
  const [loading, setLoading] = useState(true);
  const [byHour, setByHour] = useState(Array(24).fill(0));

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const since = new Date(
        Date.now() - 7 * 24 * 60 * 60 * 1000
      ).toISOString();
      const { data } = await supabase
        .from("matches")
        .select("start_time")
        .gte("start_time", since);
      const counts = Array(24).fill(0);
      (data || []).forEach((m) => {
        const d = new Date(m.start_time);
        counts[d.getUTCHours()]++;
      });
      setByHour(counts);
      setLoading(false);
    };
    load();
  }, []);

  return (
    <div className="p-5 bg-card rounded-2xl shadow border border-border/50">
      <h3 className="text-sm font-semibold mb-3">Activity Heatmap (UTC, 7d)</h3>
      {loading ? (
        <div className="grid grid-cols-8 gap-2">
          {[...Array(24)].map((_, i) => (
            <div key={i} className="h-7 rounded bg-muted/40 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-8 gap-2">
          {byHour.map((v, i) => (
            <Cell key={i} label={`${i}:00`} value={v} />
          ))}
        </div>
      )}
      <div className="mt-2 text-[11px] text-muted-foreground">
        * koristi UTC satnicu (lakše agregiranje kroz vremenske zone).
      </div>
    </div>
  );
}
