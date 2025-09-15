// src/features/match/MatchHeader.jsx
import { formatMatchTime } from "../../utils/formatMatchTime";
import {
  validateLiveStatus,
  calculateDisplayMinute,
} from "../../utils/matchStatusUtils";

export default function MatchHeader({ match, onRefresh, refreshing, scorers }) {
  if (!match) return null;

  const { formattedDate, formattedTime } = formatMatchTime(match.start_time);
  const status = validateLiveStatus(match);
  const isLive = status === "live" || status === "ht";
  const minute = isLive ? calculateDisplayMinute(match) : null;

  return (
    <div className="mb-6 rounded-2xl border border-white/10 bg-gradient-to-b from-zinc-900/60 to-zinc-900/30 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {match.competition && (
            <span className="rounded-full bg-zinc-800/70 px-3 py-1 text-xs font-semibold text-zinc-300">
              {match.competition}
            </span>
          )}
          {match.round && (
            <span className="rounded-full bg-zinc-800/70 px-3 py-1 text-xs text-zinc-300">
              {match.round}
            </span>
          )}
        </div>

        <div className="text-xs text-zinc-400">
          {formattedDate} • {formattedTime}
          {match.venue ? ` • ${match.venue}` : ""}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 items-center gap-3 md:gap-6">
        <div className="text-right">
          <div className="text-lg font-semibold md:text-2xl">
            {match.home_team}
          </div>
        </div>

        <div className="text-center">
          <div className="text-4xl font-bold md:text-5xl">
            {match.home_score ?? 0}{" "}
            <span className="mx-2 text-zinc-600">–</span>{" "}
            {match.away_score ?? 0}
          </div>
          <div className="mt-1 text-xs font-medium uppercase tracking-wide text-zinc-400">
            {isLive ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-1 text-red-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />
                {minute ? minute : "LIVE"}
              </span>
            ) : status === "finished" ? (
              "FT"
            ) : status === "ht" ? (
              "HT"
            ) : (
              "KICKOFF"
            )}
          </div>
        </div>

        <div className="text-left">
          <div className="text-lg font-semibold md:text-2xl">
            {match.away_team}
          </div>
        </div>
      </div>

      {/* Scorers bar */}
      {Array.isArray(scorers) && scorers.length > 0 && (
        <div className="mt-4 rounded-xl border border-white/10 bg-zinc-900/50 p-3 text-xs text-zinc-300 flex flex-wrap gap-3 justify-center">
          {scorers.map((s) => (
            <span
              key={s.id}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-full bg-zinc-800/70 ${
                s.team === "home" ? "text-emerald-300" : "text-sky-300"
              }`}
              title={`${s.player} ${
                s.isOwnGoal ? "(OG)" : s.isPenalty ? "(P)" : ""
              }`}
            >
              <span className="font-medium max-w-[110px] truncate">
                {s.player}
              </span>
              <span className="text-zinc-400">{s.minute || "?"}'</span>
              {s.isPenalty && <span className="text-amber-400">(P)</span>}
              {s.isOwnGoal && <span className="text-red-400">(OG)</span>}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center justify-center gap-3">
        <button
          onClick={onRefresh}
          className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700"
        >
          {refreshing ? "Updating..." : "Refresh"}
        </button>
      </div>
    </div>
  );
}
