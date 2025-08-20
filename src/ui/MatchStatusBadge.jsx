// src/ui/MatchStatusBadge.jsx - REUSABLE STATUS BADGE COMPONENT
import { useMemo } from "react";
import {
  isMatchLive,
  isMatchFinished,
  isMatchUpcoming,
} from "../utils/matchFilterUtils";
import { calculateDisplayMinute } from "../utils/matchStatusUtils";

export default function MatchStatusBadge({
  match,
  size = "sm", // xs, sm, md, lg
  variant = "default", // default, minimal, pill
  showMinute = true,
  className = "",
}) {
  const statusInfo = useMemo(() => {
    const isLive = isMatchLive(match);
    const isFinished = isMatchFinished(match);
    const isUpcoming = isMatchUpcoming(match);

    let displayText = match.status || "N/A";
    let bgColor = "bg-gray-600";
    let textColor = "text-white";
    let shouldAnimate = false;

    if (isLive) {
      const minute = showMinute ? calculateDisplayMinute(match) : null;
      displayText = minute || "LIVE";
      bgColor = "bg-red-600";
      textColor = "text-white";
      shouldAnimate = true;
    } else if (match.status?.toLowerCase() === "ht") {
      displayText = "HT";
      bgColor = "bg-orange-600";
      textColor = "text-white";
    } else if (isFinished) {
      displayText = "FT";
      bgColor = "bg-green-700";
      textColor = "text-white";
    } else if (isUpcoming) {
      const startTime = new Date(match.start_time);
      displayText = startTime.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      bgColor = "bg-blue-600";
      textColor = "text-white";
    } else if (
      ["canceled", "cancelled", "postponed", "abandoned", "suspended"].includes(
        match.status?.toLowerCase()
      )
    ) {
      const statusMap = {
        canceled: "OTKAZANO",
        cancelled: "OTKAZANO",
        postponed: "ODGOĐENO",
        abandoned: "PREKID",
        suspended: "PAUZA",
      };
      displayText =
        statusMap[match.status.toLowerCase()] || match.status.toUpperCase();
      bgColor = "bg-gray-600";
      textColor = "text-white";
    }

    return {
      text: displayText,
      bgColor,
      textColor,
      shouldAnimate,
      isLive,
      isFinished,
      isUpcoming,
    };
  }, [match, showMinute]);

  const getSizeClasses = () => {
    switch (size) {
      case "xs":
        return "px-1.5 py-0.5 text-[10px]";
      case "sm":
        return "px-2 py-1 text-xs";
      case "md":
        return "px-3 py-1.5 text-sm";
      case "lg":
        return "px-4 py-2 text-base";
      default:
        return "px-2 py-1 text-xs";
    }
  };

  const getVariantClasses = () => {
    switch (variant) {
      case "minimal":
        return "border border-current bg-transparent";
      case "pill":
        return "rounded-full";
      default:
        return "rounded";
    }
  };

  const baseClasses = [
    "font-semibold inline-flex items-center justify-center",
    "transition-all duration-300",
    getSizeClasses(),
    getVariantClasses(),
    statusInfo.shouldAnimate ? "animate-pulse" : "",
    variant === "minimal"
      ? statusInfo.textColor
      : `${statusInfo.bgColor} ${statusInfo.textColor}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={baseClasses} title={getTooltipText(match, statusInfo)}>
      {/* Live indicator dot */}
      {statusInfo.isLive && size !== "xs" && (
        <span className="w-1.5 h-1.5 bg-white rounded-full mr-1.5 animate-pulse" />
      )}

      {statusInfo.text}
    </span>
  );
}

/**
 * Generate tooltip text for status badge
 */
function getTooltipText(match, statusInfo) {
  const startTime = new Date(match.start_time).toLocaleString();

  if (statusInfo.isLive) {
    return `Live match started at ${startTime}`;
  }

  if (statusInfo.isFinished) {
    return `Match finished - started at ${startTime}`;
  }

  if (statusInfo.isUpcoming) {
    return `Match starts at ${startTime}`;
  }

  return `Match status: ${match.status} - ${startTime}`;
}

// Specialized variants for common use cases

export function LiveStatusBadge({ match, showMinute = true, size = "sm" }) {
  if (!isMatchLive(match)) return null;

  return (
    <MatchStatusBadge
      match={match}
      showMinute={showMinute}
      size={size}
      variant="pill"
      className="shadow-lg"
    />
  );
}

export function UpcomingStatusBadge({ match, size = "sm" }) {
  if (!isMatchUpcoming(match)) return null;

  return (
    <MatchStatusBadge
      match={match}
      showMinute={false}
      size={size}
      variant="default"
    />
  );
}

export function FinishedStatusBadge({ match, size = "sm" }) {
  if (!isMatchFinished(match)) return null;

  return (
    <MatchStatusBadge
      match={match}
      showMinute={false}
      size={size}
      variant="default"
    />
  );
}

export function MinimalStatusBadge({ match, size = "xs" }) {
  return (
    <MatchStatusBadge
      match={match}
      size={size}
      variant="minimal"
      showMinute={false}
    />
  );
}
