// src/features/match/LineupsTab.jsx
export default function LineupsTab({
  id,
  lineups,
  formations,
  homeName,
  awayName,
}) {
  const starters = (arr) => (arr || []).filter((x) => x.is_starting);
  const bench = (arr) => (arr || []).filter((x) => !x.is_starting);

  return (
    <section id={id} className="space-y-6">
      <TeamBlock
        name={homeName}
        formation={formations.home}
        starters={starters(lineups.home)}
        bench={bench(lineups.home)}
      />
      <TeamBlock
        name={awayName}
        formation={formations.away}
        starters={starters(lineups.away)}
        bench={bench(lineups.away)}
      />
    </section>
  );
}

function TeamBlock({ name, formation, starters, bench }) {
  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-lg font-semibold text-zinc-200">{name}</h4>
        <div className="text-xs text-zinc-400">
          {formation ? `Formation: ${formation}` : "—"}
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        <PlayerList title="Starting XI" rows={starters} />
        <PlayerList title="Bench" rows={bench} />
      </div>
    </div>
  );
}

function PlayerList({ title, rows }) {
  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
        {title}
      </div>
      <ul className="divide-y divide-white/5 rounded-lg border border-white/10 bg-zinc-900/60">
        {rows?.length ? (
          rows.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between px-3 py-2 text-sm"
            >
              <div className="flex items-center gap-3">
                <span className="font-mono text-zinc-400">
                  {r.jersey_number ?? "—"}
                </span>
                <span className="text-zinc-200">
                  {r.players?.full_name || "Unknown"}
                </span>
              </div>
              <div className="text-right text-xs text-zinc-400">
                {r.position ?? r.players?.position ?? "—"}
              </div>
            </li>
          ))
        ) : (
          <li className="px-3 py-2 text-sm text-zinc-400">No data.</li>
        )}
      </ul>
    </div>
  );
}
