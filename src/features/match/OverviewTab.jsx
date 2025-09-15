// src/features/match/OverviewTab.jsx
export default function OverviewTab({ id, agg, events, match }) {
  const grouped = groupEvents(events);
  const noStats = !agg || [agg.home, agg.away].some(v => !v) || (
    (agg.home.goals||0)+(agg.home.shots||0)+(agg.home.passes||0)+(agg.home.tackles||0)+
    (agg.away.goals||0)+(agg.away.shots||0)+(agg.away.passes||0)+(agg.away.tackles||0)
  ) === 0;
  return (
    <section id={id} className="space-y-8">
      <div>
        <h3 className="mb-3 text-lg font-semibold text-zinc-200">Key stats</h3>
        {noStats ? (
          <div className="rounded-md bg-zinc-800/40 p-4 text-sm text-zinc-400">
            Stats not available yet. (Awaiting ingestion)
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-4">
            <StatCard label="Shots" home={agg.home.shots} away={agg.away.shots} />
            <StatCard label="Goals" home={agg.home.goals} away={agg.away.goals} />
            <StatCard label="Passes" home={agg.home.passes} away={agg.away.passes} />
            <StatCard label="Tackles" home={agg.home.tackles} away={agg.away.tackles} />
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-3 text-lg font-semibold text-zinc-200">Timeline</h3>
        {!events?.length && (
          <div className="rounded-md bg-zinc-800/50 p-4 text-sm text-zinc-400">
            No events yet.
          </div>
        )}
        {events?.length > 0 && (
          <div className="space-y-6">
            {grouped.map((half) => (
              <div key={half.label}>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  {half.label}
                </div>
                <ul className="relative">
                  {half.items.map((e) => (
                    <TimelineItem key={e.id} event={e} isHome={e.team === 'home'} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function groupEvents(events = []) {
  if (!events.length) return [];
  const first = [];
  const second = [];
  const extra = [];
  events.forEach((e) => {
    const m = e.minute ?? 0;
    if (m <= 45) first.push(e);
    else if (m <= 90) second.push(e);
    else extra.push(e);
  });
  const res = [];
  if (first.length) res.push({ label: 'First Half', items: first });
  if (second.length) res.push({ label: 'Second Half', items: second });
  if (extra.length) res.push({ label: 'Extra Time', items: extra });
  return res;
}

function iconFor(event) {
  switch (event.event_type) {
    case 'goal':
    case 'penalty_goal':
      return '⚽';
    case 'own_goal':
      return '🎯';
    case 'yellow_card':
      return '🟨';
    case 'second_yellow':
      return '🟨🟥';
    case 'red_card':
      return '🟥';
    case 'substitution':
    case 'substitution_in':
    case 'substitution_out':
      return '🔁';
    case 'var':
      return '🖥️';
    case 'penalty_miss':
      return '❌⚽';
    case 'corner':
      return '⚑';
    case 'offside':
      return '⛳';
    default:
      return '•';
  }
}

function TimelineItem({ event, isHome }) {
  const minute = event.minute != null ? `${event.minute}'` : '—';
  const icon = iconFor(event);
  return (
    <li
      className={`flex items-start mb-2 ${
        isHome ? 'justify-start pr-8' : 'justify-end pl-8'
      }`}
    >
      <div
        className={`max-w-[260px] rounded-lg px-3 py-2 text-xs leading-relaxed border flex gap-2 items-center shadow-sm ${
          isHome
            ? 'bg-emerald-900/30 border-emerald-500/30 text-emerald-200'
            : 'bg-sky-900/30 border-sky-500/30 text-sky-200'
        }`}
      >
        <span className="font-mono text-xs text-zinc-300 w-8">{minute}</span>
        <span className="text-base">{icon}</span>
        <span className="flex-1 truncate">
          {event.player_name || event.description || event.event_type.replace('_', ' ')}
        </span>
      </div>
    </li>
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
