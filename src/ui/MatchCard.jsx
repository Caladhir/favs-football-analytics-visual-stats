// src/components/MatchCard.jsx - OPTIMIZIRANA VERZIJA BEZ RESTART PROBLEMA
import { useState, useEffect, useRef, useMemo } from "react";
import { Link } from "react-router-dom";
import { formatMatchTime } from "../utils/formatMatchTime";
import {
  validateLiveStatus,
  calculateDisplayMinute,
  calculateRealTimeMinute,
} from "../utils/matchStatusUtils";

export default function MatchCard({ match }) {
  // Real-time state za live minute
  const [displayMinute, setDisplayMinute] = useState(null);
  const intervalRef = useRef(null);

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

  // 🔧 OPTIMIZIRAN: Timer koji se ne restarta nepotrebno
  useEffect(() => {
    // Ukloni postojeći timer
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Ako nije live/ht, nema timera
    if (!isLive && !isHalfTime) {
      setDisplayMinute(null);
      return;
    }

    // 🔧 PROVJERA: Je li utakmica prestar za timer?
    const now = new Date();
    const startTime = new Date(matchData.start_time);
    const hoursElapsed = (now - startTime) / (1000 * 60 * 60);

    if (hoursElapsed > 2.5) {
      console.warn(
        `⚠️ Match too old for timer: ${matchData.home_team} vs ${
          matchData.away_team
        } (${hoursElapsed.toFixed(1)}h)`
      );
      setDisplayMinute("LIVE");
      return;
    }

    // Postavi početnu minutu
    const initialMinute = calculateDisplayMinute(match, now);
    setDisplayMinute(initialMinute);

    // Pokreni timer
    intervalRef.current = setInterval(() => {
      const newTime = new Date();
      const newMinute = calculateDisplayMinute(match, newTime);
      setDisplayMinute(newMinute);
    }, 1000);

    // Log početka timera (samo jednom)
    if (import.meta.env.DEV) {
      console.log(
        `⏱️ Timer started: ${matchData.home_team} vs ${matchData.away_team}`
      );
    }

    // Cleanup funkcija
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        if (import.meta.env.DEV) {
          console.log(
            `⏱️ Timer stopped: ${matchData.home_team} vs ${matchData.away_team}`
          );
        }
      }
    };
  }, [matchData, isLive, isHalfTime, match]); // Dodao 'match' za ESLint

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
      // Live utakmice - crveni rezultat s pulsiranjem
      return "text-red-500 font-bold text-xl min-w-[2rem] text-center animate-pulse";
    }

    if (isFinished) {
      // Završene utakmice - zeleni rezultat
      return "text-green-600 font-bold text-xl min-w-[2rem] text-center";
    }

    // Ostale utakmice - default stil
    return "text-foreground font-bold text-xl min-w-[2rem] text-center";
  };

  // 🔧 OPTIMIZIRANI: Status text generation
  const getStatusText = () => {
    if (isHalfTime) return "HT";

    if (isLive) {
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

  // 🔧 POBOLJŠANI: Debug info s boljim podacima
  const renderDebugInfo = () => {
    if (!import.meta.env.DEV || (!isLive && !isHalfTime)) return null;

    const normalizedStatus = match.status?.toLowerCase();
    const isStatusOverridden = validatedStatus !== normalizedStatus;
    const hasBackendMinute =
      typeof match.minute === "number" && !isNaN(match.minute);

    const now = new Date();
    const startTime = new Date(match.start_time);
    const hoursElapsed = (now - startTime) / (1000 * 60 * 60);
    const realTimeMinute = calculateRealTimeMinute(match, now);
    const shouldBeFinished = hoursElapsed > 2;

    return (
      <div className="text-[10px] text-right space-y-1">
        <div
          className={
            isStatusOverridden ? "text-red-500 font-bold" : "text-blue-500"
          }
        >
          Status: {match.status} → {validatedStatus}
        </div>

        <div
          className={
            shouldBeFinished
              ? "text-red-500 font-bold"
              : "text-yellow-400 font-bold"
          }
        >
          {shouldBeFinished ? "🚨 ZOMBIE" : "⏱️"} Real-time: {realTimeMinute}'
        </div>

        <div className={hasBackendMinute ? "text-green-500" : "text-red-500"}>
          Backend: {hasBackendMinute ? `${match.minute}'` : "❌ NULL"}
        </div>

        <div
          className={
            shouldBeFinished ? "text-red-500" : "text-muted-foreground"
          }
        >
          Age: {hoursElapsed.toFixed(1)}h {shouldBeFinished ? "⚠️" : ""}
        </div>

        {hasBackendMinute && typeof realTimeMinute === "number" && (
          <div className="text-cyan-400">
            Diff: {Math.abs(realTimeMinute - match.minute)}m
          </div>
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
          {/* 🔧 Status badge */}
          <span
            className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusBadgeStyle()}`}
          >
            {getStatusText()}
            {/* Animirani indikator samo za validne live minute */}
            {isLive &&
              displayMinute &&
              displayMinute !== "LIVE" &&
              typeof displayMinute === "string" &&
              displayMinute.includes("'") && (
                <span className="ml-1 animate-pulse">⏱️</span>
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
