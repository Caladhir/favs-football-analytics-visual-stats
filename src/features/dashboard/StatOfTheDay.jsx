// src/features/dashboard/StatOfTheDay.jsx - Vertically Centered
import { useStatOfTheDay } from "../../hooks/useStatOfTheDay";

export default function StatOfTheDay() {
  const { stat, loading, error } = useStatOfTheDay();

  return (
    <div className="h-full p-5 bg-card rounded-2xl shadow border border-border/50 flex flex-col justify-center">
      <div className="text-center">
        <div className="text-sm font-semibold mb-4 flex items-center justify-center gap-2">
          🏆 <span>Stat of the Day</span>
        </div>
        {loading ? (
          <div className="flex justify-center">
            <div className="h-5 w-52 bg-muted/40 rounded animate-pulse" />
          </div>
        ) : error ? (
          <div className="text-sm text-destructive">{error}</div>
        ) : stat ? (
          <div className="text-sm text-muted-foreground">
            <div className="mb-2">Highest scoring match (7d):</div>
            <div className="font-semibold text-foreground text-lg mb-2">
              {stat.teams}
            </div>
            <div className="text-xs">
              Total:{" "}
              <span className="font-bold text-2xl text-primary">
                {stat.goals}
              </span>{" "}
              goals
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">
            No data available.
          </div>
        )}
      </div>
    </div>
  );
}
