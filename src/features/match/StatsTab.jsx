// src/features/match/StatsTab.jsx
export default function StatsTab({ id, agg }) {
  const rows = [
    { k: "Shots", h: agg.home.shots, a: agg.away.shots },
    { k: "Goals (from player stats)", h: agg.home.goals, a: agg.away.goals },
    { k: "Passes", h: agg.home.passes, a: agg.away.passes },
    { k: "Tackles", h: agg.home.tackles, a: agg.away.tackles },
  ];

  return (
    <section id={id}>
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
              const h = Number(r.h) || 0;
              const a = Number(r.a) || 0;
              const diff = h - a;
              return (
                <tr key={r.k} className="bg-zinc-900/40">
                  <td className="px-3 py-2 text-zinc-200">{r.k}</td>
                  <td className="px-3 py-2 text-right font-medium text-zinc-100">
                    {h}
                  </td>
                  <td className="px-3 py-2 text-center text-xs text-zinc-400">
                    {diff === 0 ? "-" : diff > 0 ? `+${diff}` : diff}
                  </td>
                  <td className="px-3 py-2 text-left font-medium text-zinc-100">
                    {a}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-zinc-500">
        Napomena: possession/xG nisu još u bazi – kad dodaš polja (npr.
        `pos_home`, `pos_away`, `xg_home`, `xg_away`) vrlo lako ih priključimo.
      </p>
    </section>
  );
}
