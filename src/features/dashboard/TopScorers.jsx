// src/features/dashboard/TopScorers.jsx - Vertically Centered
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
  const { scorers, loading, error } = useTopScorers(5);

  return (
    <div className="h-full p-5 bg-card rounded-2xl shadow border border-border/50 flex flex-col">
      <div className="text-center mb-4">
        <h3 className="text-sm font-semibold flex items-center justify-center gap-2">
          ⚽ Top Scorers (7d)
        </h3>
      </div>

      <div className="flex-1 flex flex-col justify-center">
        {loading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
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
