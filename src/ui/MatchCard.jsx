// src/ui/MatchCard.jsx - ISPRAVKA: PRIORITIZIRA BACKEND MINUTU
import { useState, useEffect, useRef, useMemo } from "react";
import { Link } from "react-router-dom";
import { formatMatchTime } from "../utils/formatMatchTime";
import {
  validateLiveStatus,
  calculateRealTimeMinute,
  analyzeMatchStatus,
} from "../utils/matchStatusUtils";

export default function MatchCard({ match }) {
  // Real-time state za live minute (SAMO kao backup)
  const [fallbackMinute, setFallbackMinute] = useState(null);
  const intervalRef = useRef(null);

  // Validacija statusa
  const validatedStatus = validateLiveStatus(match);

  // Status flags
  const isLive = validatedStatus === "live" || validatedStatus === "inprogress";
  const isHalfTime = validatedStatus === "ht";
  const isUpcoming = validatedStatus === "upcoming";
  const isFinished = validatedStatus === "finished";
  const isCanceled = validatedStatus === "canceled";
  const isPostponed = validatedStatus === "postponed";
  const isAbandoned = validatedStatus === "abandoned";
  const isSuspended = validatedStatus === "suspended";

  // Memoiziraj ključne podatke za optimizaciju
  const matchData = useMemo(
    () => ({
      id: match.id,
      start_time: match.start_time,
      minute: match.minute,
      status: match.status,
      home_team: match.home_team,
      away_team: match.away_team,
    }),
    [
      match.id,
      match.start_time,
      match.minute,
      match.status,
      match.home_team,
      match.away_team,
    ]
  );

  // 🔧 ISPRAVKA: Provjera da li backend minuta postoji i VALIDNA je
  const hasValidBackendMinute = useMemo(() => {
    return (
      match.minute !== null &&
      match.minute !== undefined &&
      typeof match.minute === "number" &&
      !isNaN(match.minute) &&
      match.minute >= 0 &&
      match.minute <= 120
    );
  }, [match.minute]);

  // 🔧 GLAVNA ISPRAVKA: Smart minute calculation - UVIJEK prioritizira backend
  const getDisplayMinute = () => {
    // 🚀 POLUVRIJEME: Uvijek prikaži "HT"
    if (isHalfTime) {
      return "HT";
    }

    if (!isLive) {
      return null;
    }

    // 🚀 PRIORITET 1: Backend minuta iz SofaScore (GLAVNA ISPRAVKA)
    if (hasValidBackendMinute) {
      if (import.meta.env.DEV) {
        console.log(
          `✅ [BACKEND] ${match.home_team} vs ${match.away_team}: ${match.minute}'`
        );
      }
      const m = match.minute;
      return m >= 105 ? `${m}' (ET)` : m >= 90 ? `${m}'+` : `${m}'`;
    }

    // 🚀 PRIORITET 2: Real-time kalkulacija (SAMO kad nema backend)
    if (typeof fallbackMinute === "string" && fallbackMinute) {
      return fallbackMinute; // već formatirano
    }

    // 🚀 PRIORITET 3: Generic "LIVE" (kad ništa ne radi)
    if (import.meta.env.DEV) {
      console.error(
        `❌ [GENERIC] ${match.home_team} vs ${match.away_team}: LIVE (no data)`
      );
    }
    return "LIVE";
  };

  // 🔧 ISPRAVKA: Timer SAMO kad NEMA backend minutu
  useEffect(() => {
    // Ukloni postojeći timer
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Timer SAMO za aktivno live utakmice BEZ backend minute
    if (!isLive || isHalfTime || hasValidBackendMinute) {
      setFallbackMinute(null);

      if (import.meta.env.DEV && hasValidBackendMinute) {
        console.log(
          `✅ [SKIP TIMER] ${match.home_team} vs ${match.away_team}: Has backend minute (${match.minute}')`
        );
      }

      return;
    }

    // 🔧 PROVJERA: Je li utakmica prestara za timer?
    const now = new Date();
    const startTime = new Date(matchData.start_time);
    const hoursElapsed = (now - startTime) / (1000 * 60 * 60);

    if (hoursElapsed > 2.5) {
      console.warn(
        `⚠️ Match too old for timer: ${matchData.home_team} vs ${
          matchData.away_team
        } (${hoursElapsed.toFixed(1)}h)`
      );
      setFallbackMinute(null);
      return;
    }

    // Postavi početnu fallback minutu
    const initialMinute = calculateRealTimeMinute(match, now);
    setFallbackMinute(initialMinute);

    // Pokreni timer SAMO za fallback
    intervalRef.current = setInterval(() => {
      const newTime = new Date();
      const newMinute = calculateRealTimeMinute(match, newTime);
      setFallbackMinute(newMinute);
    }, 1000);

    // Log početka timera
    if (import.meta.env.DEV) {
      console.warn(
        `⏱️ [TIMER START] ${matchData.home_team} vs ${matchData.away_team}: No backend minute, using fallback`
      );
    }

    // Cleanup funkcija
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        if (import.meta.env.DEV) {
          console.log(
            `⏱️ [TIMER STOP] ${matchData.home_team} vs ${matchData.away_team}`
          );
        }
      }
    };
  }, [matchData, isLive, isHalfTime, hasValidBackendMinute]); // 🔧 Dodao hasValidBackendMinute

  // Cleanup na unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

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

  const getScoreStyle = () => {
    if (isLive || isHalfTime) {
      return "text-red-500 font-bold text-xl min-w-[2rem] text-center animate-pulse";
    }

    if (isFinished) {
      return "text-green-600 font-bold text-xl min-w-[2rem] text-center";
    }

    return "text-foreground font-bold text-xl min-w-[2rem] text-center";
  };

  // 🔧 ISPRAVKA: Status text s prioritetom backend minute
  const getStatusText = () => {
    if (isHalfTime) return "HT";

    if (isLive) {
      const displayMinute = getDisplayMinute();
      return displayMinute || "LIVE";
    }

    if (isFinished) return "FT";
    if (isCanceled) return "OTKAZANO";
    if (isPostponed) return "ODGOĐENO";
    if (isAbandoned) return "PREKID";
    if (isSuspended) return "PAUZA";
    if (isUpcoming) return formattedTime;

    return match.status || "N/A";
  };

  // 🔧 POBOLJŠANI: Debug info s jasnim označavanjem izvora
  const renderDebugInfo = () => {
    if (!import.meta.env.DEV || (!isLive && !isHalfTime)) return null;

    const statusAnalysis = analyzeMatchStatus(match);
    const displayMinute = getDisplayMinute();

    return (
      <div className="text-[10px] text-right space-y-1">
        {/* Status info */}
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

        {/* 🔧 ISPRAVKA: Jasno označavanje izvora minute */}
        <div
          className={
            hasValidBackendMinute
              ? "text-green-500 font-bold"
              : fallbackMinute
              ? "text-yellow-500"
              : "text-red-500"
          }
        >
          Display: {displayMinute}
          {hasValidBackendMinute && " 🎯 BACKEND"}
          {!hasValidBackendMinute && fallbackMinute && " ⏱️ FALLBACK"}
          {isHalfTime && " 🟠 HT"}
        </div>

        {/* Backend minute status */}
        <div
          className={hasValidBackendMinute ? "text-green-500" : "text-red-500"}
        >
          Backend:{" "}
          {hasValidBackendMinute
            ? (() => {
                const m = match.minute;
                return (
                  (m >= 105 ? `${m}' (ET)` : m >= 90 ? `${m}'+` : `${m}'`) +
                  " ✅"
                );
              })()
            : "NULL/INVALID ❌"}
        </div>

        {/* Real-time minute (for comparison) */}
        <div className="text-cyan-400">
          Real-time: {statusAnalysis.minute.realtime}
        </div>

        {/* Age */}
        <div
          className={
            statusAnalysis.possibleIssues.veryOld
              ? "text-red-500"
              : "text-muted-foreground"
          }
        >
          Age: {statusAnalysis.hoursElapsed}h{" "}
          {statusAnalysis.possibleIssues.veryOld && (
            <div className="text-red-500">⚠️ VERY OLD</div>
          )}
        </div>

        {/* Difference between backend and real-time */}
        {hasValidBackendMinute &&
          statusAnalysis.minute.diffBackendVsRealtime !== null && (
            <div
              className={
                statusAnalysis.minute.diffBackendVsRealtime > 10
                  ? "text-red-400"
                  : "text-purple-400"
              }
            >
              Diff: {statusAnalysis.minute.diffBackendVsRealtime}m
              {statusAnalysis.minute.diffBackendVsRealtime > 10 &&
                " 🚨 BIG DIFF"}
            </div>
          )}

        {/* Missing backend warning */}
        {!hasValidBackendMinute && isLive && (
          <div className="text-red-400 font-bold">⚠️ NO BACKEND MINUTE</div>
        )}
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
            <div className={getScoreStyle()}>
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
            <div className={getScoreStyle()}>
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
            {/* 🔧 ISPRAVKA: Bolji indikatori izvora minute */}
            {isLive && hasValidBackendMinute && (
              <span className="ml-1 text-green-300">🎯</span>
            )}
            {isLive && !hasValidBackendMinute && fallbackMinute && (
              <span className="ml-1 text-yellow-300">⏱️</span>
            )}
            {isLive && !hasValidBackendMinute && !fallbackMinute && (
              <span className="ml-1 text-red-300">❌</span>
            )}
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
