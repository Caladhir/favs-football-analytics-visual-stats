// src/features/dashboard/BestWorstPerformers.jsx - Vertically Centered
import { useBestWorstPerformers } from "../../hooks/useBestWorstPerformers";

export default function BestWorstPerformers() {
  const { performers, loading, error } = useBestWorstPerformers(7, 3);

  return (
    <div className="h-full p-5 bg-card rounded-2xl shadow border border-border/50 flex flex-col">
      <div className="text-center mb-4">
        <h3 className="text-sm font-semibold flex items-center justify-center gap-2">
          📈 Best/Worst Performers (goals, 7d)
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Best Performers */}
            <div>
              <div className="text-center mb-3">
                <h4 className="text-xs font-semibold text-emerald-400 flex items-center justify-center gap-1">
                  🏆 Best
                </h4>
              </div>
              <div className="space-y-2">
                {performers.best.map((performer, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between px-3 py-2 rounded-lg bg-emerald-600/10 hover:bg-emerald-600/20 transition-colors"
                  >
                    <span className="text-sm font-medium">
                      {performer.team}
                    </span>
                    <span className="text-sm font-bold text-emerald-400">
                      {performer.display}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Worst Performers */}
            <div>
              <div className="text-center mb-3">
                <h4 className="text-xs font-semibold text-red-400 flex items-center justify-center gap-1">
                  📉 Worst
                </h4>
              </div>
              <div className="space-y-2">
                {performers.worst.map((performer, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between px-3 py-2 rounded-lg bg-red-600/10 hover:bg-red-600/20 transition-colors"
                  >
                    <span className="text-sm font-medium">
                      {performer.team}
                    </span>
                    <span className="text-sm font-bold text-red-400">
                      {performer.display}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
