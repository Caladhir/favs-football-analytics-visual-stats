// src/features/dashboard/ActivityHeatmap.jsx - Vertically Centered
import { useActivityHeatmap } from "../../hooks/useActivityHeatmap";

export default function ActivityHeatmap() {
  const { hourlyData, totalMatches, loading, error } = useActivityHeatmap(7);

  const getIntensityClass = (value) => {
    if (value === 0) return "bg-slate-700/50";
    if (value <= 2) return "bg-green-800";
    if (value <= 4) return "bg-green-600";
    if (value <= 6) return "bg-green-400";
    return "bg-green-200 text-gray-900";
  };

  return (
    <div className="h-full p-6 bg-card rounded-2xl shadow border border-border/50 flex flex-col">
      <div className="text-center mb-6">
        <h3 className="text-lg font-semibold text-white mb-1 flex items-center justify-center gap-2">
          🕒 Activity Heatmap
        </h3>
        <p className="text-sm text-muted-foreground">
          Matches by hour (this week) •{" "}
          <span className="font-semibold text-primary">{totalMatches}</span>{" "}
          total
        </p>
      </div>

      <div className="flex-1 flex flex-col justify-center">
        {loading ? (
          <div className="grid grid-cols-6 gap-2 mb-6">
            {[...Array(24)].map((_, i) => (
              <div key={i} className="h-10 rounded bg-muted/40 animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="text-center text-sm text-destructive mb-6">
            {error}
          </div>
        ) : (
          <div className="grid grid-cols-6 gap-2 mb-6">
            {hourlyData.map((count, hour) => (
              <div
                key={hour}
                className={`h-10 rounded text-xs font-medium flex flex-col items-center justify-center cursor-default transition-all duration-300 hover:scale-110 ${getIntensityClass(
                  count
                )}`}
                title={`${hour}:00 - ${count} matches`}
              >
                <div className="text-[10px] opacity-75">{hour}h</div>
                <div className="text-xs font-bold">{count}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
        <span>Less</span>
        <div className="flex items-center gap-1">
          {[0, 1, 3, 5, 7].map((level, idx) => (
            <div
              key={idx}
              className={`w-3 h-3 rounded ${getIntensityClass(level)}`}
            />
          ))}
        </div>
        <span>More</span>
      </div>
    </div>
  );
}
