// src/features/dashboard/FormGuide.jsx - Vertically Centered
import { useFormGuide } from "../../hooks/useFormGuide";

export default function FormGuide() {
  const { summary, loading, error } = useFormGuide();

  return (
    <div className="h-full p-5 bg-card rounded-2xl shadow border border-border/50 flex flex-col justify-center">
      <div className="text-center">
        <div className="flex items-center justify-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-full bg-emerald-600/20 text-emerald-400 inline-flex items-center justify-center">
            ⚡
          </div>
          <div className="text-sm font-semibold">Form Guide</div>
        </div>

        {loading ? (
          <div className="flex justify-center">
            <div className="h-5 w-40 bg-muted/40 rounded animate-pulse" />
          </div>
        ) : error ? (
          <div className="text-sm text-destructive">{error}</div>
        ) : (
          <div className="text-sm text-muted-foreground">
            <div className="mb-2">In the last 7 days:</div>
            <div className="text-2xl font-bold text-foreground mb-1">
              {summary.over25}/{summary.total}
            </div>
            <div className="text-xs">matches had over 2.5 goals</div>
            <div className="text-xs text-emerald-400 mt-2">
              ({summary.percentage}% success rate)
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
