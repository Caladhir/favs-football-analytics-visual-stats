// src/features/match/StatsTab.jsx
export default function StatsTab({ id, agg, richStats }) {
  // Build rows from richStats if available, else fallback to basic agg
  let rows;
  if (richStats) {
    const order = [
      "possession",
      "shots_total",
      "shots_on_target",
      "xg",
      "corners",
      "fouls",
      "offsides",
      "passes",
      "pass_accuracy",
      "yellow_cards",
      "red_cards",
      "saves",
    ];
    rows = order
      .map((key) => {
        const obj = richStats[key];
        if (!obj) return null;
        return {
          key,
          label: obj.label,
          home: obj.home,
          away: obj.away,
          type: obj.type,
          precision: obj.precision,
        };
      })
      .filter(Boolean);
  } else {
    rows = [
      { label: "Shots", home: agg.home.shots, away: agg.away.shots },
      {
        label: "Goals (from player stats)",
        home: agg.home.goals,
        away: agg.away.goals,
      },
      { label: "Passes", home: agg.home.passes, away: agg.away.passes },
      { label: "Tackles", home: agg.home.tackles, away: agg.away.tackles },
    ];
  }

  const allZero = !rows.length || rows.every(r => (Number(r.home)||0)===0 && (Number(r.away)||0)===0);

  return (
    <section id={id}>
      {allZero ? (
        <div className="rounded-md bg-zinc-800/40 p-4 text-sm text-zinc-400">
          Stats not available yet. (Awaiting ingestion)
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-zinc-900/70 text-zinc-400">
              <tr>
                <th className="px-3 py-2 text-left">Stat</th>
                <th className="px-3 py-2 text-right">Home</th>
                <th className="px-3 py-2 text-center">Diff</th>
                <th className="px-3 py-2 text-left">Away</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((r) => {
                const h = r.home == null ? null : Number(r.home);
                const a = r.away == null ? null : Number(r.away);
                const diff = h != null && a != null ? h - a : null;
                const formatVal = (v) => {
                  if (v == null || Number.isNaN(v)) return "—";
                  if (r.type === "percent") return `${Math.round(v)}%`;
                  if (r.precision) return Number(v).toFixed(r.precision);
                  return v;
                };
                return (
                  <tr key={r.key || r.label} className="bg-zinc-900/40">
                    <td className="px-3 py-2 text-zinc-200 whitespace-nowrap">
                      {r.label}
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-zinc-100">
                      {formatVal(h)}
                    </td>
                    <td className="px-3 py-2 text-center text-xs text-zinc-400">
                      {diff == null
                        ? "-"
                        : diff === 0
                        ? "-"
                        : diff > 0
                        ? `+${diff}`
                        : diff}
                    </td>
                    <td className="px-3 py-2 text-left font-medium text-zinc-100">
                      {formatVal(a)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {richStats?.updated_at && (
        <p className="mt-3 text-xs text-zinc-500">
          Team stats updated: {new Date(richStats.updated_at).toLocaleTimeString()}
        </p>
      )}
    </section>
  );
}
