// src/ui/MatchCard.jsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { formatMatchTime } from "../utils/formatMatchTime";
import {
  validateLiveStatus,
  calculateDisplayMinute,
  analyzeMatchStatus,
} from "../utils/matchStatusUtils";

export default function MatchCard({ match }) {
  // tick samo da re-rendera svake sekunde dok je live/HT
  const [tick, setTick] = useState(0);

  const validatedStatus = validateLiveStatus(match);

  const isLive = validatedStatus === "live" || validatedStatus === "inprogress";
  const isHalfTime = validatedStatus === "ht";
  const isUpcoming = validatedStatus === "upcoming";
  const isFinished = validatedStatus === "finished";
  const isCanceled = validatedStatus === "canceled";
  const isPostponed = validatedStatus === "postponed";
  const isAbandoned = validatedStatus === "abandoned";
  const isSuspended = validatedStatus === "suspended";

  useEffect(() => {
    if (!isLive && !isHalfTime) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive, isHalfTime]);

  const { formattedDate, formattedTime } = formatMatchTime(match.start_time);

  const getStatusBadgeStyle = () => {
    if (isLive) return "bg-red-600 text-white animate-pulse";
    if (isHalfTime) return "bg-orange-600 text-white";
    if (isFinished) return "bg-green-700 text-white";
    if (isUpcoming) return "bg-blue-600 text-white";
    if (isCanceled || isPostponed || isAbandoned || isSuspended) {
      return "bg-gray-600 text-white";
    }
    return "bg-muted text-muted-foreground";
  };

  const getScoreStyle = () => {
    if (isLive || isHalfTime) {
      return "text-red-500 font-bold text-xl min-w-[2rem] text-center animate-pulse";
    }
    if (isFinished) {
      return "text-green-600 font-bold text-xl min-w-[2rem] text-center";
    }
    return "text-foreground font-bold text-xl min-w-[2rem] text-center";
  };

  const getStatusText = () => {
    if (isHalfTime) return "HT";
    if (isLive) return calculateDisplayMinute(match) || "LIVE";
    if (isFinished) return "FT";
    if (isCanceled) return "OTKAZANO";
    if (isPostponed) return "ODGOĐENO";
    if (isAbandoned) return "PREKID";
    if (isSuspended) return "PAUZA";
    if (isUpcoming) return formattedTime;
    return match.status || "N/A";
  };

  const renderDebugInfo = () => {
    if (!import.meta.env.DEV || (!isLive && !isHalfTime)) return null;
    const statusAnalysis = analyzeMatchStatus(match);
    return (
      <div className="text-[10px] text-right space-y-1">
        <div
          className={
            statusAnalysis.statusChanged
              ? "text-red-500 font-bold"
              : "text-blue-500"
          }
        >
          Status: {statusAnalysis.originalStatus} →{" "}
          {statusAnalysis.validatedStatus}
        </div>
        <div className="text-cyan-400">
          Real-time: {statusAnalysis.minute.realtime}
        </div>
        <div className="text-muted-foreground">
          Age: {statusAnalysis.hoursElapsed}h
        </div>
      </div>
    );
  };

  return (
    <li className="bg-border rounded-lg p-4 hover:bg-primary/50 hover:scale-[1.02] transition-all duration-300 ease-in-out cursor-pointer ">
      <Link to={`/match/${match.id}`} className="block">
        {/* Competition header */}
        <div className="text-center mb-3">
          <div className="text-muted-foreground text-sm font-medium">
            {match.competition || "Unknown Competition"}
          </div>
          {match.round && (
            <div className="text-muted-foreground text-xs mt-1">
              {match.round}
            </div>
          )}
        </div>

        {/* Teams & score */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3 flex-1">
              <div
                className="w-4 h-4 rounded-full flex-shrink-0"
                style={{ backgroundColor: match.home_color || "#6B7280" }}
              />
              <span className="text-foreground font-medium text-left flex-1">
                {match.home_team}
              </span>
            </div>
            <div className={getScoreStyle()}>
              {match.home_score !== null
                ? match.home_score
                : isUpcoming
                ? "-"
                : "0"}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3 flex-1">
              <div
                className="w-4 h-4 rounded-full flex-shrink-0"
                style={{ backgroundColor: match.away_color || "#6B7280" }}
              />
              <span className="text-foreground font-medium text-left flex-1">
                {match.away_team}
              </span>
            </div>
            <div className={getScoreStyle()}>
              {match.away_score !== null
                ? match.away_score
                : isUpcoming
                ? "-"
                : "0"}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-600">
          <span
            className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusBadgeStyle()}`}
          >
            {getStatusText()}
          </span>

          <div className="text-right text-xs text-muted-foreground space-y-1">
            <div className="flex items-center space-x-1">
              <span>🕐</span>
              <span>
                {formattedTime} • {formattedDate}
              </span>
            </div>
            {match.venue && (
              <div className="flex items-center space-x-1">
                <span>📍</span>
                <span className="truncate max-w-32">{match.venue}</span>
              </div>
            )}
            {renderDebugInfo()}
          </div>
        </div>
      </Link>
    </li>
  );
}
