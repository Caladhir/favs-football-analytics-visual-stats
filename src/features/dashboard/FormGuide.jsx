// src/features/dashboard/FormGuide.jsx - Vertically Centered
import { useFormGuide } from "../../hooks/useFormGuide";

export default function FormGuide() {
  const { summary, loading, error } = useFormGuide({ limit: 5 });

  return (
    <div className="h-full p-5 bg-card rounded-2xl shadow border border-border/50 flex flex-col">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-full bg-emerald-600/20 text-emerald-400 inline-flex items-center justify-center">🏆</div>
        <div className="text-sm font-semibold">Top Form (Wins last {summary.periodDays}d)</div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-6 bg-muted/40 rounded animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="text-sm text-destructive">{error}</div>
      ) : summary.teams.length === 0 ? (
        <div className="text-sm text-muted-foreground">No finished matches in period.</div>
      ) : (
        <ol className="text-sm flex-1 overflow-auto custom-scroll pr-1">
          {summary.teams.map((t, idx) => (
            <li
              key={t.team_id}
              className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-b-0"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs w-5 text-muted-foreground">{idx + 1}.</span>
                <span className="truncate max-w-[120px] text-foreground" title={t.name}>{t.name}</span>
              </div>
              <div className="flex items-center gap-3 text-xs font-mono">
                <span className="text-emerald-400 font-semibold">{t.wins}W</span>
                <span className="text-muted-foreground">{t.played}P</span>
                <span className="text-foreground">{t.winPct}%</span>
              </div>
            </li>
          ))}
        </ol>
      )}
      <div className="mt-2 text-[10px] text-muted-foreground/70 italic">
        Ranked by wins, then win% (last 30 days)
      </div>
    </div>
  );
}
