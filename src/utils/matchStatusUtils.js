// matchStatusUtils.js - Stable baseline revert (simplified, de-duplicated)
// Exposes: normalizeStatus, validateLiveStatus, calculateDisplayMinute, calculateRealTimeMinute,
// analyzeMatchStatus, findProblemMatches + legacy re-exports for live filters.

import { DISPLAY_BACKEND_FRESH_SEC, LIVE_STALE_SEC } from "../services/live";
export {
  getValidLiveMatches,
  getValidLiveMatchesStrict,
} from "./liveMatchFilters"; // legacy compatibility for old imports

const LIVE_SET = new Set(["live", "ht", "inprogress", "halftime"]);

function parseStart(st) {
  if (st == null) return null;
  if (typeof st === "number") return new Date(st < 1e12 ? st * 1000 : st);
  const s = String(st);
  // If string lacks timezone, assume UTC (append Z)
  const iso = /Z$|[+\-]\d{2}:\d{2}$/.test(s)
    ? s
    : s + (s.includes("T") ? "" : "T") + "Z";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

export function normalizeStatus(status) {
  if (!status) return "upcoming";
  const s = String(status).toLowerCase();
  const map = {
    live: "live",
    inplay: "live",
    inprogress: "live",
    in_progress: "live",
    "1h": "live",
    "2h": "live",
    "1st_half": "live",
    "2nd_half": "live",
    ht: "ht",
    halftime: "ht",
    half_time: "ht",
    upcoming: "upcoming",
    not_started: "upcoming",
    scheduled: "upcoming",
    ns: "upcoming",
    notstarted: "upcoming",
    finished: "finished",
    ft: "finished",
    full_time: "finished",
    ended: "finished",
    afterextra: "finished",
    penalties: "finished",
    canceled: "canceled",
    cancelled: "canceled",
    postponed: "postponed",
    pp: "postponed",
    abandoned: "abandoned",
    ab: "abandoned",
    suspended: "suspended",
    susp: "suspended",
  };
  return map[s] || s;
}

export function validateLiveStatus(match) {
  const raw = String(match?.status || match?.status_type || "").toLowerCase();
  let mapped = normalizeStatus(raw);
  if (mapped === "ht") return "ht";

  // Bridge upcoming -> live near kickoff if provider late updating status.
  if (!LIVE_SET.has(mapped)) {
    if (mapped === "upcoming") {
      const start = parseStart(
        match.current_period_start || match.start_time
      ).getTime();
      if (Number.isFinite(start)) {
        const diffMs = Date.now() - start; // negative => before kickoff
        const mins = Math.floor(diffMs / 60000);
        if (diffMs > -2 * 60 * 1000 && diffMs < 120 * 60 * 1000) {
          // -2m .. +120m window
          if (mins >= 45 && mins <= 60) return "ht"; // halftime window based on elapsed
          return "live";
        }
      }
    }
    return mapped;
  }

  const now = Date.now();
  const start = parseStart(
    match.current_period_start || match.start_time
  ).getTime();
  if (Number.isFinite(start)) {
    const mins = Math.floor((now - start) / 60000);
    if (mapped === "live" && mins >= 45 && mins <= 60) return "ht"; // halftime conversion
    if ((now - start) / 36e5 > 3) return "finished"; // auto-finish safety >3h
    if ((now - start) / 36e5 < -0.1) return "upcoming"; // >6min before kickoff still upcoming
  }
  return "live";
}

export function hasValidBackendMinute(match) {
  return (
    match &&
    typeof match.minute === "number" &&
    !Number.isNaN(match.minute) &&
    match.minute >= 0 &&
    match.minute <= 120
  );
}

export function isBackendMinuteFresh(
  match,
  maxAgeSeconds = DISPLAY_BACKEND_FRESH_SEC
) {
  if (!match?.updated_at) return false;
  const ts = new Date(match.updated_at).getTime();
  if (!Number.isFinite(ts)) return false;
  return (Date.now() - ts) / 1000 <= maxAgeSeconds;
}

function formatMinute(minute) {
  if (minute <= 0) return "1'";
  if (minute >= 105 && minute <= 120) return `${minute}' (ET)`;
  if (minute >= 90) return `${minute}'+`;
  return `${minute}'`;
}

// Simple rotating cache to reduce recalculation within short intervals.
const minuteCache = new Map();
function cacheKey(match) {
  return `${match.id}-${match.updated_at}-${Math.floor(Date.now() / 5000)}`; // 5s bucket
}

export function calculateDisplayMinute(match) {
  const status = validateLiveStatus(match);
  if (status !== "live") return status === "ht" ? "HT" : null;
  const key = cacheKey(match);
  if (minuteCache.has(key)) return minuteCache.get(key);

  let value;
  if (hasValidBackendMinute(match) && isBackendMinuteFresh(match)) {
    value = formatMinute(match.minute);
  } else {
    const rt = calculateSimpleRealTime(match);
    if (rt) value = rt;
    else if (hasValidBackendMinute(match)) value = formatMinute(match.minute);
    else value = "LIVE";
  }

  minuteCache.set(key, value);
  if (minuteCache.size > 120) {
    for (const k of Array.from(minuteCache.keys()).slice(0, 40))
      minuteCache.delete(k);
  }
  if (import.meta.env?.DEV) {
    try {
      // Warn if scheduled_start_ts deviates strongly from parsed start_time
      if (typeof match.scheduled_start_ts === "number" && match.start_time) {
        const schedMs =
          match.scheduled_start_ts < 1e12
            ? match.scheduled_start_ts * 1000
            : match.scheduled_start_ts;
        const start = parseStart(match.start_time)?.getTime();
        if (start && Math.abs(start - schedMs) > 20 * 60 * 1000) {
          console.warn(
            "[minuteCalc][start-drift]",
            match.id,
            "scheduled_ts",
            new Date(schedMs).toISOString(),
            "start_time",
            match.start_time
          );
        }
      }
    } catch {}
  }
  return value;
}

// Internal per-match computed kickoff adjustment (memory only)
const runtimeOffsets = new Map(); // match.id -> minutes integer

function calculateSimpleRealTime(match) {
  try {
    const id = match.id || match.source_event_id;
    const hasBackendMinute =
      hasValidBackendMinute(match) && isBackendMinuteFresh(match);
    // 1. Determine base scheduled start
    let baseStart = parseStart(match.start_time);
    // Heuristic: if scheduled_start_ts exists and differs by exactly +/-3600s (1h) from start_time, trust scheduled_start_ts instead
    if (typeof match.scheduled_start_ts === "number") {
      const sched = parseStart(match.scheduled_start_ts);
      if (sched && baseStart) {
        const delta = Math.abs(sched.getTime() - baseStart.getTime());
        if (Math.abs(delta - 3600 * 1000) < 5000) {
          // within 5s of one hour diff
          baseStart = sched;
          if (import.meta.env?.DEV)
            console.warn(
              "[time-fix][1h-shift-applied]",
              match.id,
              match.start_time,
              "-> scheduled_start_ts"
            );
        }
      } else if (sched && !baseStart) {
        baseStart = sched;
      }
    }
    // 2. Use current_period_start if available (this is actual kickoff OR half restart)
    let cps = parseStart(match.current_period_start);
    // 3. If we have kickoff_offset_min from backend and NO cps yet, adjust baseStart
    if (!cps && typeof match.kickoff_offset_min === "number" && baseStart) {
      baseStart = new Date(
        baseStart.getTime() + match.kickoff_offset_min * 60000
      );
    }
    // 4. If scheduled_start_ts present and start_time missing/invalid, fallback
    if (!baseStart && typeof match.scheduled_start_ts === "number") {
      baseStart = parseStart(match.scheduled_start_ts);
    }
    if (!baseStart) return null;

    // If cps exists and is within a sensible window ( -5 .. +90 min from base ), treat cps as actual kickoff (first period)
    let kickoff = baseStart;
    if (cps) {
      const diffMin = (cps.getTime() - baseStart.getTime()) / 60000;
      if (diffMin > -5 && diffMin < 90) {
        kickoff = cps;
      }
    }

    const nowMs = Date.now();
    const elapsedTotal = Math.floor((nowMs - kickoff.getTime()) / 60000);
    if (elapsedTotal < 0) return "1'";

    // Halftime / second half handling.
    // If we have a second-half restart (cps newer than 30 min after kickoff and backend status is live/ht), treat it as restart.
    // Some feeds set current_period_start again at 2H start.
    let secondHalfRestart = null;
    if (cps && cps.getTime() > kickoff.getTime() + 30 * 60000) {
      const diffFromKick = (cps.getTime() - kickoff.getTime()) / 60000;
      if (diffFromKick >= 45 && diffFromKick <= 75) {
        secondHalfRestart = cps; // treat cps as restart of 2H
      }
    }

    // Runtime drift correction using backend minute if large gap (once)
    if (id && hasBackendMinute) {
      const backendMin = match.minute;
      if (
        typeof backendMin === "number" &&
        backendMin >= 1 &&
        backendMin <= 120
      ) {
        // Estimate our current displayed real-time minute (pre-correction) to compare
        let est;
        if (!secondHalfRestart) {
          est = Math.min(elapsedTotal, 90);
          if (elapsedTotal > 45 && elapsedTotal <= 60)
            est = 45; // halftime freeze
          else if (elapsedTotal > 60)
            est = Math.min(45 + (elapsedTotal - 60), 90);
        } else {
          const beforeRestart = Math.floor(
            (secondHalfRestart.getTime() - kickoff.getTime()) / 60000
          );
          const afterRestart = Math.floor(
            (nowMs - secondHalfRestart.getTime()) / 60000
          );
          if (afterRestart < 0) est = 45;
          else est = Math.min(45 + afterRestart, 90);
        }
        const diff = est - backendMin;
        if (
          Math.abs(diff) >= 6 &&
          Math.abs(diff) <= 30 &&
          !runtimeOffsets.has(id)
        ) {
          // apply negative diff as offset adjustment to kickoff
          runtimeOffsets.set(id, -diff); // shift by diff minutes to align future calc
        }
      }
    }

    // Apply runtime offset if present and no cps second-half override
    const rtOffset = id ? runtimeOffsets.get(id) : null;
    if (typeof rtOffset === "number" && !secondHalfRestart) {
      kickoff = new Date(kickoff.getTime() + rtOffset * 60000);
    }

    const elapsed = Math.floor((nowMs - kickoff.getTime()) / 60000);
    if (elapsed < 0) return "1'";
    if (elapsed > 150) return "90+";

    if (!secondHalfRestart) {
      if (elapsed <= 45) return `${Math.max(1, elapsed)}'`;
      if (elapsed <= 60) return "45+"; // halftime
      if (elapsed <= 105) {
        const secondHalf = 45 + (elapsed - 60);
        return formatMinute(Math.min(secondHalf, 90));
      }
      return "90+";
    }
    // With explicit second-half restart timestamp
    const beforeRestart = Math.floor(
      (secondHalfRestart.getTime() - kickoff.getTime()) / 60000
    );
    const afterRestart = Math.floor(
      (nowMs - secondHalfRestart.getTime()) / 60000
    );
    // beforeRestart should be ~45-55; clamp to 45 baseline
    const base = beforeRestart >= 40 && beforeRestart <= 60 ? 45 : 45;
    if (afterRestart < 0) return `${base}'`;
    const minute = base + afterRestart;
    if (minute >= 90) return "90+";
    return formatMinute(minute);
  } catch {
    return null;
  }
}

export function calculateRealTimeMinute(match) {
  return calculateSimpleRealTime(match);
}

export function analyzeMatchStatus(match) {
  const now = Date.now();
  const start = new Date(match.start_time).getTime();
  const hoursElapsed = Number.isFinite(start)
    ? ((now - start) / 36e5).toFixed(1)
    : "n/a";
  const validatedStatus = validateLiveStatus(match);
  const backendMinute = hasValidBackendMinute(match)
    ? `${match.minute}'`
    : null;
  const backendFresh = isBackendMinuteFresh(match);
  const realtime = calculateSimpleRealTime(match);
  const display = calculateDisplayMinute(match);
  let diff = null;
  if (backendMinute && realtime && /^\d+/.test(realtime)) {
    diff = Math.abs(parseInt(backendMinute, 10) - parseInt(realtime, 10));
  }
  const isStale =
    match.updated_at &&
    now - new Date(match.updated_at).getTime() > LIVE_STALE_SEC * 1000;
  return {
    originalStatus: match.status || match.status_type,
    validatedStatus,
    hoursElapsed,
    minute: {
      backend: backendMinute,
      backendFresh,
      realtime,
      display,
      diffBackendVsRealtime: diff,
    },
    possibleIssues: {
      stale: !!isStale,
      veryOld: Number(hoursElapsed) > 2,
      noValidMinute: !backendMinute && !realtime,
    },
    statusChanged:
      (match.status || match.status_type || "").toLowerCase() !==
      validatedStatus,
  };
}

export function findProblemMatches(matches, opts = {}) {
  const now = Date.now();
  const maxAgeHours = opts.maxAgeHours ?? 2;
  const staleCutoffMs = (opts.staleCutoffSec ?? LIVE_STALE_SEC) * 1000;
  return (matches || []).filter((m) => {
    const s = normalizeStatus(m.status || m.status_type);
    if (s !== "live" && s !== "ht") return false;
    const start = new Date(m.start_time).getTime();
    const hoursElapsed = Number.isFinite(start) ? (now - start) / 36e5 : 0;
    const upd = m.updated_at ? new Date(m.updated_at).getTime() : NaN;
    const isStale =
      s !== "ht" && Number.isFinite(upd) && now - upd > staleCutoffMs;
    return hoursElapsed > maxAgeHours || isStale;
  });
}

// Developer helper: detailed breakdown for debugging a single match's time logic
export function debugMinuteBreakdown(match) {
  const baseStart = parseStart(match.start_time);
  const cps = parseStart(match.current_period_start);
  return {
    id: match.id,
    start_time: match.start_time,
    scheduled_start_ts: match.scheduled_start_ts,
    kickoff_offset_min: match.kickoff_offset_min,
    runtime_offset_min: runtimeOffsets.get(match.id) || null,
    current_period_start: match.current_period_start,
    parsed_base_ms: baseStart?.getTime() || null,
    parsed_cps_ms: cps?.getTime() || null,
    now_ms: Date.now(),
    backend_minute: match.minute,
    backend_status: match.status || match.status_type,
    display: calculateDisplayMinute(match),
  };
}
