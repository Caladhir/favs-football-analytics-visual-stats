// src/features/dashboard/LeagueTable.jsx - Vertically Centered
import { useLeagueTable } from "../../hooks/useLeagueTable";

export default function LeagueTable() {
  const { teams, loading, error } = useLeagueTable(30, 6);

  return (
    <div className="h-full p-5 bg-card rounded-2xl shadow border border-border/50 flex flex-col">
      <div className="text-center mb-4">
        <h3 className="text-sm font-semibold flex items-center justify-center gap-2">
          🏆 League Table (30d)
        </h3>
      </div>

      <div className="flex-1 flex flex-col justify-center">
        {loading ? (
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-10 bg-muted/40 rounded animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="text-center text-sm text-destructive">{error}</div>
        ) : (
          <div className="divide-y divide-border/50">
            {teams.map((team, idx) => (
              <div
                key={idx}
                className="grid grid-cols-[32px_1fr_56px] items-center py-3 px-3 rounded hover:bg-muted/40 transition-colors"
              >
                <div className="text-center">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-bold">
                    {idx + 1}
                  </span>
                </div>
                <div className="text-sm font-medium">{team.name}</div>
                <div className="text-center font-bold text-lg text-primary">
                  {team.points}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="text-center mt-4 text-xs text-muted-foreground">
        * Points calculated from finished matches in last 30 days.
      </div>
    </div>
  );
}
