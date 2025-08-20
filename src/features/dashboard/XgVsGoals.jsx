// src/features/dashboard/XgVsGoals.jsx - Vertically Centered
import { useXgVsGoals } from "../../hooks/useXgVsGoals";

export default function XgVsGoals() {
  const { teams, loading, error } = useXgVsGoals(21, 4);

  return (
    <div className="h-full p-5 bg-card rounded-2xl shadow border border-border/50 flex flex-col">
      <div className="text-center mb-4">
        <h3 className="text-sm font-semibold flex items-center justify-center gap-2">
          📊 xG vs Actual (proxy)
        </h3>
      </div>

      <div className="flex-1 flex flex-col justify-center">
        {loading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-14 bg-muted/40 rounded animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="text-center text-sm text-destructive">{error}</div>
        ) : teams.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-8">
            No data available.
          </div>
        ) : (
          <div className="space-y-3">
            {teams.map((team, idx) => {
              const pct = Math.round(
                ((team.actual - team.expected) / team.expected) * 100
              );
              return (
                <div key={idx} className="p-4 bg-muted/40 rounded-lg">
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="font-medium">{team.team}</span>
                    <span
                      className={`text-xs font-semibold px-2 py-1 rounded-full ${
                        pct > 0
                          ? "bg-green-500/20 text-green-400"
                          : "bg-red-500/20 text-red-400"
                      }`}
                    >
                      {pct > 0 ? `+${pct}%` : `${pct}%`}
                    </span>
                  </div>
                  <div className="h-3 w-full bg-muted rounded-full overflow-hidden mb-2">
                    <div
                      className="h-3 bg-gradient-to-r from-primary/50 to-primary transition-all duration-500"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.round((team.actual / team.expected) * 50)
                        )}%`,
                      }}
                    />
                  </div>
                  <div className="text-center text-xs text-muted-foreground">
                    Actual:{" "}
                    <span className="font-semibold">
                      {team.actual.toFixed(2)}
                    </span>{" "}
                    • Expected:{" "}
                    <span className="font-semibold">
                      {team.expected.toFixed(2)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="text-center mt-4 text-xs text-muted-foreground">
        * xG proxy is simplified until we add real xG data.
      </div>
    </div>
  );
}
