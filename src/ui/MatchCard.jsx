// src/components/MatchCard.jsx - FIKSIRANA VERZIJA
import { Link } from "react-router-dom";
import { formatMatchTime } from "../utils/formatMatchTime";
import {
  validateLiveStatus,
  calculateDisplayMinute,
} from "../utils/matchStatusUtils";

export default function MatchCard({ match }) {
  // Validacija statusa
  const validatedStatus = validateLiveStatus(match);

  // Status flags
  const isLive = validatedStatus === "live";
  const isHalfTime = validatedStatus === "ht";
  const isUpcoming = validatedStatus === "upcoming";
  const isFinished = validatedStatus === "finished";
  const isCanceled = validatedStatus === "canceled";
  const isPostponed = validatedStatus === "postponed";
  const isAbandoned = validatedStatus === "abandoned";
  const isSuspended = validatedStatus === "suspended";

  // Formatiranje vremena
  const { formattedDate, formattedTime } = formatMatchTime(match.start_time);

  // Status badge styling
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

  // 🔧 SIMPLIFIED: Status text generation - koristi samo calculateDisplayMinute
  const getStatusText = () => {
    if (isHalfTime) return "HT";

    if (isLive) {
      const displayMinute = calculateDisplayMinute(match);
      return displayMinute || "LIVE"; // Ako nema minute, samo "LIVE"
    }

    if (isFinished) return "FT";
    if (isCanceled) return "OTKAZANO";
    if (isPostponed) return "ODGOĐENO";
    if (isAbandoned) return "PREKID";
    if (isSuspended) return "PAUZA";
    if (isUpcoming) return formattedTime;

    return match.status || "N/A";
  };

  // 🔧 ENHANCED: Debug info for development
  const renderDebugInfo = () => {
    if (!import.meta.env.DEV || (!isLive && !isHalfTime)) return null;

    const normalizedStatus = match.status?.toLowerCase();
    const isStatusOverridden = validatedStatus !== normalizedStatus;
    const hasBackendMinute =
      typeof match.minute === "number" && !isNaN(match.minute);
    const displayMinute = calculateDisplayMinute(match);

    const now = new Date();
    const startTime = new Date(match.start_time);
    const hoursElapsed = (now - startTime) / (1000 * 60 * 60);

    return (
      <div className="text-[10px] text-right space-y-1">
        <div
          className={
            isStatusOverridden ? "text-red-500 font-bold" : "text-blue-500"
          }
        >
          Raw: {match.status} → Valid: {validatedStatus}
        </div>

        <div className={hasBackendMinute ? "text-green-500" : "text-red-500"}>
          Backend: {hasBackendMinute ? `${match.minute}'` : "❌ MISSING"}
        </div>

        <div className="text-muted-foreground">
          Display: {displayMinute || "LIVE"} | Hours: {hoursElapsed.toFixed(1)}h
        </div>

        {!hasBackendMinute && (
          <div className="text-red-500 font-bold">⚠️ USING FALLBACK!</div>
        )}
      </div>
    );
  };

  return (
    <li className="bg-border rounded-lg p-4 hover:bg-primary/50 hover:scale-[1.02] transition-all duration-500 ease-in-out ">
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

        {/* Main match content */}
        <div className="space-y-3">
          {/* Home team row */}
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
            <div className="text-foreground font-bold text-xl min-w-[2rem] text-center">
              {match.home_score !== null
                ? match.home_score
                : isUpcoming
                ? "-"
                : "0"}
            </div>
          </div>

          {/* Away team row */}
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
            <div className="text-foreground font-bold text-xl min-w-[2rem] text-center">
              {match.away_score !== null
                ? match.away_score
                : isUpcoming
                ? "-"
                : "0"}
            </div>
          </div>
        </div>

        {/* Footer with status and time */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-600">
          {/* Status badge */}
          <span
            className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusBadgeStyle()}`}
          >
            {getStatusText()}
          </span>

          {/* Time and venue */}
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
