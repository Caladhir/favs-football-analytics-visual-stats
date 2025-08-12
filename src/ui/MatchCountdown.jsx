// src/ui/MatchCountdown.jsx - COUNTDOWN COMPONENT FOR UPCOMING MATCHES
import { useState, useEffect } from "react";
import { isMatchUpcoming } from "../utils/matchFilterUtils";

export default function MatchCountdown({
  match,
  size = "sm",
  showSeconds = false,
  threshold = 24 * 60 * 60 * 1000, // Show countdown only if match is within 24h
  onMatchStart = null,
  className = "",
}) {
  const [timeLeft, setTimeLeft] = useState(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!isMatchUpcoming(match)) {
      setIsVisible(false);
      return;
    }

    const calculateTimeLeft = () => {
      const now = new Date().getTime();
      const matchStart = new Date(match.start_time).getTime();
      const timeDiff = matchStart - now;

      // Hide countdown if match is too far in the future
      if (timeDiff > threshold) {
        setIsVisible(false);
        return null;
      }

      // Match has started or passed
      if (timeDiff <= 0) {
        setIsVisible(false);
        if (onMatchStart && typeof onMatchStart === "function") {
          onMatchStart(match);
        }
        return null;
      }

      setIsVisible(true);

      // Calculate time components
      const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
      const hours = Math.floor(
        (timeDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
      );
      const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((timeDiff % (1000 * 60)) / 1000);

      return { days, hours, minutes, seconds, totalMs: timeDiff };
    };

    // Initial calculation
    const initialTime = calculateTimeLeft();
    setTimeLeft(initialTime);

    // Set up interval for updates
    const interval = setInterval(() => {
      const newTime = calculateTimeLeft();
      setTimeLeft(newTime);
    }, 1000);

    return () => clearInterval(interval);
  }, [match, threshold, onMatchStart]);

  if (!isVisible || !timeLeft) {
    return null;
  }

  const formatTimeLeft = () => {
    const { days, hours, minutes, seconds } = timeLeft;

    // Different formats based on time remaining
    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return showSeconds
        ? `${hours}h ${minutes}m ${seconds}s`
        : `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return showSeconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
    } else {
      return `${seconds}s`;
    }
  };

  const getUrgencyLevel = () => {
    const { totalMs } = timeLeft;
    const minutes = totalMs / (1000 * 60);

    if (minutes <= 5) return "critical"; // Red - starting very soon
    if (minutes <= 30) return "urgent"; // Orange - starting soon
    if (minutes <= 120) return "warning"; // Yellow - starting in 2h
    return "normal"; // Blue - normal countdown
  };

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

  const getUrgencyClasses = () => {
    const urgency = getUrgencyLevel();

    switch (urgency) {
      case "critical":
        return "bg-red-600 text-white animate-pulse";
      case "urgent":
        return "bg-orange-600 text-white animate-pulse";
      case "warning":
        return "bg-yellow-600 text-white";
      default:
        return "bg-blue-600 text-white";
    }
  };

  const getIcon = () => {
    const urgency = getUrgencyLevel();

    switch (urgency) {
      case "critical":
        return "🚨";
      case "urgent":
        return "⏰";
      case "warning":
        return "⏳";
      default:
        return "🕐";
    }
  };

  return (
    <div
      className={`
        inline-flex items-center justify-center gap-1.5 
        rounded-full font-semibold transition-all duration-300
        ${getSizeClasses()} 
        ${getUrgencyClasses()}
        ${className}
      `}
      title={`Match starts at ${new Date(match.start_time).toLocaleString()}`}
    >
      <span className="flex-shrink-0">{getIcon()}</span>
      <span className="font-mono">{formatTimeLeft()}</span>
    </div>
  );
}

// Specialized variants

export function CriticalCountdown({ match, onMatchStart }) {
  // Only show for matches starting in next 30 minutes
  return (
    <MatchCountdown
      match={match}
      size="md"
      showSeconds={true}
      threshold={30 * 60 * 1000} // 30 minutes
      onMatchStart={onMatchStart}
      className="shadow-lg"
    />
  );
}

export function CompactCountdown({ match }) {
  return (
    <MatchCountdown
      match={match}
      size="xs"
      showSeconds={false}
      threshold={2 * 60 * 60 * 1000} // 2 hours
    />
  );
}

export function DetailedCountdown({ match, onMatchStart }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <MatchCountdown
        match={match}
        size="lg"
        showSeconds={true}
        threshold={24 * 60 * 60 * 1000} // 24 hours
        onMatchStart={onMatchStart}
        className="shadow-lg"
      />
      <div className="text-xs text-muted-foreground text-center">
        {match.home_team} vs {match.away_team}
      </div>
      <div className="text-xs text-muted-foreground">
        {new Date(match.start_time).toLocaleString()}
      </div>
    </div>
  );
}

// Hook for managing multiple match countdowns
export function useMatchCountdowns(matches, onAnyMatchStart) {
  const [imminentMatches, setImminentMatches] = useState([]);

  useEffect(() => {
    const updateImminentMatches = () => {
      const now = new Date().getTime();
      const imminent = matches.filter((match) => {
        if (!isMatchUpcoming(match)) return false;

        const matchStart = new Date(match.start_time).getTime();
        const timeDiff = matchStart - now;

        // Consider matches starting in next 2 hours as imminent
        return timeDiff > 0 && timeDiff <= 2 * 60 * 60 * 1000;
      });

      setImminentMatches(imminent);
    };

    updateImminentMatches();
    const interval = setInterval(updateImminentMatches, 30000); // Update every 30s

    return () => clearInterval(interval);
  }, [matches]);

  const handleMatchStart = (match) => {
    console.log(`🚨 Match started: ${match.home_team} vs ${match.away_team}`);
    if (onAnyMatchStart) {
      onAnyMatchStart(match);
    }
  };

  return {
    imminentMatches,
    handleMatchStart,
    hasImminentMatches: imminentMatches.length > 0,
    imminentCount: imminentMatches.length,
  };
}
