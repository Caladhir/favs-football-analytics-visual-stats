// src/features/dashboard/UpsetAlert.jsx - Vertically Centered
import { useUpsetAlert } from "../../hooks/useUpsetAlert";

export default function UpsetAlert() {
  const { upset, loading, error } = useUpsetAlert();

  return (
    <div className="h-full p-5 bg-card rounded-2xl shadow border border-border/50 flex flex-col justify-center">
      <div className="text-center">
        <div className="text-sm font-semibold mb-4 flex items-center justify-center gap-2">
          ⚠️ <span>Upset Alert</span>
        </div>
        {loading ? (
          <div className="flex justify-center">
            <div className="h-5 w-60 bg-muted/40 rounded animate-pulse" />
          </div>
        ) : error ? (
          <div className="text-sm text-destructive">{error}</div>
        ) : upset ? (
          (() => {
            const diff = (upset.away_score || 0) - (upset.home_score || 0);
            const major = diff > 3;
            if (!major) {
              return (
                <div className="text-sm text-muted-foreground">
                  <div className="mb-2">
                    No major upsets (&gt;3 goal away win).
                  </div>
                  <div className="text-xs text-muted-foreground mb-1">
                    Latest finished:
                  </div>
                  <div className="font-semibold text-foreground text-lg mb-1">
                    {upset.away_team}
                  </div>
                  <div className="font-semibold text-foreground text-lg mb-2">
                    {upset.home_team}
                  </div>
                  <div className="text-xs mb-2">
                    {upset.competition || "recent match"}
                  </div>
                  <div className="text-xl font-bold text-primary">
                    {upset.away_score}:{upset.home_score}
                  </div>
                </div>
              );
            }
            return (
              <div className="text-sm text-muted-foreground">
                <div className="font-semibold text-foreground text-lg mb-1">
                  {upset.away_team}
                </div>
                <div className="text-xs mb-2 text-muted-foreground">
                  shocked
                </div>
                <div className="font-semibold text-foreground text-lg mb-2">
                  {upset.home_team}
                </div>
                <div className="text-xs text-muted-foreground mb-2">
                  {upset.competition || "recent match"}
                </div>
                <div className="text-2xl font-bold text-primary">
                  {upset.away_score}:{upset.home_score}
                </div>
                <div className="text-[10px] mt-1 text-muted-foreground">
                  Goal diff: {diff}
                </div>
              </div>
            );
          })()
        ) : (
          <div className="text-sm text-muted-foreground">
            No recent upsets detected.
          </div>
        )}
      </div>
    </div>
  );
}
