// src/features/match/OverviewTab.jsx
export default function OverviewTab({ id, agg, events, match }) {
  return (
    <section id={id} className="space-y-6">
      {/* Key stats */}
      <div>
        <h3 className="mb-3 text-lg font-semibold text-zinc-200">Key stats</h3>
        <div className="grid gap-3 md:grid-cols-3">
          <StatCard label="Shots" home={agg.home.shots} away={agg.away.shots} />
          <StatCard
            label="Goals (from player stats)"
            home={agg.home.goals}
            away={agg.away.goals}
          />
          <StatCard
            label="Tackles"
            home={agg.home.tackles}
            away={agg.away.tackles}
          />
        </div>
      </div>

      {/* Timeline */}
      <div>
        <h3 className="mb-3 text-lg font-semibold text-zinc-200">Timeline</h3>
        {events?.length ? (
          <ul className="space-y-2">
            {events.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between rounded-lg bg-zinc-800/60 px-3 py-2 text-sm"
              >
                <span className="font-mono text-zinc-300">
                  {e.minute ?? "—"}'
                </span>
                <span className="text-zinc-200">
                  {e.event_type.replace("_", " ")}
                </span>
                <span className="truncate text-right text-zinc-400">
                  {e.player_name ? `${e.player_name} • ` : ""}
                  {e.team}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-md bg-zinc-800/50 p-4 text-sm text-zinc-400">
            No events yet.
          </div>
        )}
      </div>
    </section>
  );
}

function StatCard({ label, home, away }) {
  const total = (Number(home) || 0) + (Number(away) || 0);
  const hp = total ? Math.round(((Number(home) || 0) / total) * 100) : 50;
  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/40 p-4">
      <div className="mb-1 text-xs uppercase tracking-wide text-zinc-400">
        {label}
      </div>
      <div className="flex items-center justify-between text-xl font-semibold">
        <span className="text-zinc-200">{home ?? "—"}</span>
        <span className="text-zinc-600">vs</span>
        <span className="text-zinc-200">{away ?? "—"}</span>
      </div>
      <div className="mt-2 h-2 w-full rounded-full bg-zinc-800">
        <div
          className="h-2 rounded-full bg-primary"
          style={{ width: `${hp}%` }}
        />
      </div>
    </div>
  );
}
