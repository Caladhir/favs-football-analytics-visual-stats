// src/ui/MatchCard.jsx - OPTIMIZED: Manje re-renderiranja
import { useEffect, useState, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import { formatMatchTime } from "../utils/formatMatchTime";
import { formatInTimezone } from "../utils/formatInTimezone";
import {
  validateLiveStatus,
  calculateDisplayMinute,
  analyzeMatchStatus,
} from "../utils/matchStatusUtils";

export default function MatchCard({ match }) {
  // 🔧 OPTIMIZACIJA: Timer tick samo ako je zaista potreban
  const [tick, setTick] = useState(0);

  // 🔧 MEMOIZE status calculation
  const statusInfo = useMemo(() => {
    const validatedStatus = validateLiveStatus(match);

    return {
      validatedStatus,
      isLive: validatedStatus === "live" || validatedStatus === "inprogress",
      isHalfTime: validatedStatus === "ht",
      isUpcoming: validatedStatus === "upcoming",
      isFinished: validatedStatus === "finished",
      isCanceled: validatedStatus === "canceled",
      isPostponed: validatedStatus === "postponed",
      isAbandoned: validatedStatus === "abandoned",
      isSuspended: validatedStatus === "suspended",
    };
  }, [match.status, match.start_time, match.updated_at]);

  // 🔧 OPTIMIZACIJA: Timer samo za live/HT utakmice
  useEffect(() => {
    if (!statusInfo.isLive && !statusInfo.isHalfTime) return;

    // Pokreni timer samo ako je potreban
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [statusInfo.isLive, statusInfo.isHalfTime]);

  // 🔧 MEMOIZE time formatting (rijetko se mijenja)
  const timeInfo = useMemo(() => {
    // Original local formatting (legacy)
    const base = formatMatchTime(match.start_time, match.scheduled_start_ts);

    // Detect naive timestamps (no Z / no +/-) which were actually UTC in source.
    const raw = (match.start_time || "").toString();
    const isNaiveISO =
      /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw) &&
      !/[Zz]|[+\-]\d{2}:?\d{2}$/.test(raw);

    // If naive, interpret as UTC then format in desired TZ (Europe/Zagreb) to avoid shift.
    let corrected = null;
    let debugTZ = null; // extra diagnostic info
    if (isNaiveISO) {
      try {
        // Append 'Z' to force UTC interpretation.
        const asUtc = new Date(raw + "Z");
        if (!isNaN(asUtc.getTime())) {
          const tzFmt = formatInTimezone(asUtc, {
            timeZone: "Europe/Zagreb",
            locale: "en-GB",
          });
          corrected = {
            formattedDate: tzFmt.date,
            formattedTime: tzFmt.time,
            dateTime: tzFmt.dateTime,
          };
          // Diagnostic: compare browser naive parse vs forced UTC parse
          const browserParse = new Date(raw); // browser will treat as local time
          debugTZ = {
            raw,
            naiveDetected: true,
            browserLocalInterpretation: browserParse.toISOString(),
            forcedUtcInterpretation: asUtc.toISOString(),
            displayed: tzFmt.dateTime,
            localOffsetMinutes:
              (browserParse.getTime() - asUtc.getTime()) / 60000,
          };
        }
      } catch (e) {
        // ignore
      }
    } else {
      // If already had timezone, just reformat explicitly in target TZ for consistency.
      try {
        const tzFmt = formatInTimezone(match.start_time, {
          timeZone: "Europe/Zagreb",
          locale: "en-GB",
        });
        corrected = {
          formattedDate: tzFmt.date,
          formattedTime: tzFmt.time,
          dateTime: tzFmt.dateTime,
        };
        debugTZ = {
          raw,
          naiveDetected: false,
          originalParse: new Date(match.start_time).toISOString(),
          displayed: tzFmt.dateTime,
        };
      } catch (e) {
        // fallback keep base
      }
    }

    if (import.meta.env.DEV && debugTZ) {
      // Log once per match id per mount
      try {
        if (!window.__TZ_DBG) window.__TZ_DBG = new Set();
        const key = `tz-${match.id}-${debugTZ.raw}`;
        if (!window.__TZ_DBG.has(key)) {
          window.__TZ_DBG.add(key);
          console.log(
            "🕒 TZ-DIAG",
            match.home_team,
            "vs",
            match.away_team,
            debugTZ
          );
        }
      } catch {}
    }

    return corrected || base;
  }, [match.start_time]);

  // 🔧 MEMOIZE display minute calculation
  const displayMinute = useMemo(() => {
    if (!statusInfo.isLive && !statusInfo.isHalfTime) return null;

    // 🔧 SMANJENO LOGIRANJE - samo jednom po minute promjeni
    const minute = calculateDisplayMinute(match);

    // Debug samo u development i ne svaku sekundu
    if (import.meta.env.DEV && tick % 10 === 0) {
      // Samo svakih 10 sekundi
      console.log(
        `⏰ Minute for ${match.home_team} vs ${match.away_team}: ${minute}`
      );
    }

    return minute;
  }, [match, statusInfo.isLive, statusInfo.isHalfTime, tick]);

  // 🔧 MEMOIZE styles
  const statusBadgeStyle = useMemo(() => {
    if (statusInfo.isLive) return "bg-red-600 text-white animate-pulse";
    if (statusInfo.isHalfTime) return "bg-orange-600 text-white";
    if (statusInfo.isFinished) return "bg-green-700 text-white";
    if (statusInfo.isUpcoming) return "bg-blue-600 text-white";
    if (
      statusInfo.isCanceled ||
      statusInfo.isPostponed ||
      statusInfo.isAbandoned ||
      statusInfo.isSuspended
    ) {
      return "bg-gray-600 text-white";
    }
    return "bg-muted text-muted-foreground";
  }, [statusInfo]);

  const scoreStyle = useMemo(() => {
    if (statusInfo.isLive || statusInfo.isHalfTime) {
      return "text-red-500 font-bold text-xl min-w-[2rem] text-center animate-pulse";
    }
    if (statusInfo.isFinished) {
      return "text-green-600 font-bold text-xl min-w-[2rem] text-center";
    }
    return "text-foreground font-bold text-xl min-w-[2rem] text-center";
  }, [statusInfo]);

  // 🔧 MEMOIZE status text
  const statusText = useMemo(() => {
    if (statusInfo.isHalfTime) return "HT";
    if (statusInfo.isLive) return displayMinute || "LIVE";
    if (statusInfo.isFinished) return "FT";
    if (statusInfo.isCanceled) return "OTKAZANO";
    if (statusInfo.isPostponed) return "ODGOĐENO";
    if (statusInfo.isAbandoned) return "PREKID";
    if (statusInfo.isSuspended) return "PAUZA";
    if (statusInfo.isUpcoming) return timeInfo.formattedTime; // kickoff time
    return match.status || "N/A";
  }, [statusInfo, displayMinute, timeInfo.formattedTime, match.status]);

  // 🔧 MEMOIZE debug info (samo u dev mode)
  const debugInfo = useMemo(() => {
    if (!import.meta.env.DEV || (!statusInfo.isLive && !statusInfo.isHalfTime))
      return null;

    // Pozovi analyzeMatchStatus samo za debug i ne na svaki tick
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
  }, [match, statusInfo.isLive, statusInfo.isHalfTime, tick]); // tick za periodic update

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
            <div className={scoreStyle}>
              {match.home_score !== null
                ? match.home_score
                : statusInfo.isUpcoming
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
            <div className={scoreStyle}>
              {match.away_score !== null
                ? match.away_score
                : statusInfo.isUpcoming
                ? "-"
                : "0"}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-600">
          <span
            className={`px-3 py-1 rounded-full text-xs font-semibold ${statusBadgeStyle}`}
          >
            {statusText}
          </span>

          <div className="text-right text-xs text-muted-foreground space-y-1">
            <div className="flex items-center space-x-1">
              <span>🕐</span>
              <span>
                {timeInfo.formattedTime} • {timeInfo.formattedDate}
              </span>
            </div>
            {match.venue && (
              <div className="flex items-center space-x-1">
                <span>📍</span>
                <span className="truncate max-w-32">{match.venue}</span>
              </div>
            )}
            {import.meta.env.DEV && (
              <div className="text-[10px] opacity-70">
                <div>raw: {String(match.start_time)}</div>
                <div>cps: {String(match.current_period_start || "—")}</div>
                <div>tz: {timeInfo.formattedTime}</div>
                {typeof window !== "undefined" && window.__TZ_DBG && (
                  <div>
                    {/* Provide a lightweight hash indicator that diagnostics logged */}
                    tzdbg✓
                  </div>
                )}
              </div>
            )}
            {debugInfo}
          </div>
        </div>
      </Link>
    </li>
  );
}
