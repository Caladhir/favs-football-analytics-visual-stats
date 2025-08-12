// src/features/match/H2HTab.jsx
import { formatMatchTime } from "../../utils/formatMatchTime";

export default function H2HTab({ id, h2h }) {
  return (
    <section id={id}>
      <div className="grid gap-2">
        {h2h?.length ? (
          h2h.map((m) => {
            const { formattedDate } = formatMatchTime(m.start_time);
            return (
              <div
                key={m.id}
                className="flex items-center justify-between rounded-lg border border-white/10 bg-zinc-900/50 px-3 py-2 text-sm"
              >
                <div className="truncate text-zinc-300">
                  {m.home_team} <span className="text-zinc-600">vs</span>{" "}
                  {m.away_team}
                  <span className="ml-2 text-xs text-zinc-500">
                    {m.competition}
                  </span>
                </div>
                <div className="font-mono text-zinc-200">
                  {m.home_score ?? "-"} : {m.away_score ?? "-"}
                </div>
                <div className="text-xs text-zinc-400">{formattedDate}</div>
              </div>
            );
          })
        ) : (
          <div className="rounded-md bg-zinc-800/50 p-4 text-sm text-zinc-400">
            No recent H2H.
          </div>
        )}
      </div>
    </section>
  );
}
