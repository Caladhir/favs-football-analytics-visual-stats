// src/features/dashboard/TopScorers.jsx - Vertically Centered
import { useState } from "react";
import { useTopScorers } from "../../hooks/useTopScorers";

function ScorerItem({ scorer }) {
  return (
    <div className="flex items-center justify-between py-3 px-4 bg-muted/40 rounded-lg hover:bg-muted/60 transition-colors">
      <div className="flex items-center gap-3">
        <span className="w-8 h-8 inline-flex items-center justify-center rounded-full bg-primary/20 text-primary text-sm font-bold">
          {scorer.rank}
        </span>
        <span className="text-sm font-medium">{scorer.name}</span>
      </div>
      <span className="text-lg font-bold text-primary">{scorer.goals}</span>
    </div>
  );
}

export default function TopScorers() {
  // Default switched to full season view
  const [period, setPeriod] = useState("season");
  const TOP_LIMIT = 10; // increased to show more scorers and reduce empty space
  const { scorers, loading, error, refetch } = useTopScorers(TOP_LIMIT, period);

  return (
    <div className="h-full p-5 bg-card rounded-2xl shadow border border-border/50 flex flex-col">
      <div className="mb-4 flex flex-col items-center gap-3">
        <h3 className="text-sm font-semibold flex items-center justify-center gap-2">
          ⚽ Top Scorers {period === "7d" && "(7d)"}
          {period === "30d" && "(30d)"}
          {period === "season" && "(Season)"}
        </h3>
        <div className="flex gap-2">
          {["7d", "30d", "season"].map((p) => (
            <button
              key={p}
              onClick={() => {
                setPeriod(p);
              }}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                p === period
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted/40 hover:bg-muted/60 border-border"
              }`}
            >
              {p === "7d" ? "7d" : p === "30d" ? "30d" : "Season"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-center">
        {loading ? (
          <div className="space-y-2">
            {[...Array(TOP_LIMIT)].map((_, i) => (
              <div key={i} className="h-12 bg-muted/40 rounded animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="text-center text-sm text-destructive">{error}</div>
        ) : scorers.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-8">
            <div className="text-4xl mb-2">⚽</div>
            <div>No scoring data available.</div>
          </div>
        ) : (
          <div className="space-y-2">
            {scorers.map((scorer) => (
              <ScorerItem key={scorer.id} scorer={scorer} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
