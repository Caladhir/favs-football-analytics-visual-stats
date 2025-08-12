// src/utils/matchStatusUtils.js - OPTIMIZED: Manje console logova
import { DISPLAY_BACKEND_FRESH_SEC, LIVE_STALE_SEC } from "../services/live";
import {
  getValidLiveMatches,
  getValidLiveMatchesStrict,
} from "./liveMatchFilters";

const LIVE_SET = new Set(["live", "ht", "inprogress", "halftime"]);

// 🔧 CACHE za minute calculation da sprečimo ponavljanje
const minuteCache = new Map();
const CACHE_DURATION = 5000; // 5 sekundi cache

function parseStart(st) {
  if (typeof st === "number") return new Date(st < 1e12 ? st * 1000 : st);
  const s = String(st);
  return /Z$|[+\-]\d{2}:\d{2}$/.test(s)
    ? new Date(s)
    : new Date(s + (s.includes("T") ? "" : "T") + "Z");
}

export function normalizeStatus(status) {
  if (!status) return "upcoming";
  const s = String(status).toLowerCase();
  const map = {
    // live
    live: "live",
    inplay: "live",
    "1h": "live",
    "2h": "live",
    "1st_half": "live",
    "2nd_half": "live",
    inprogress: "live",
    // ht
    ht: "ht",
    halftime: "ht",
    half_time: "ht",
    // upcoming
    upcoming: "upcoming",
    not_started: "upcoming",
    scheduled: "upcoming",
    ns: "upcoming",
    notstarted: "upcoming",
    // finished
    finished: "finished",
    ft: "finished",
    full_time: "finished",
    ended: "finished",
    afterextra: "finished",
    penalties: "finished",
    // other
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
  if (!LIVE_SET.has(mapped)) return mapped;

  const now = Date.now();
  const start = parseStart(match.start_time).getTime();
  if (Number.isFinite(start)) {
    const mins = Math.floor((now - start) / 60000);
    // Ako SofaScore ostane "live" u pauzi – tretiraj kao HT
    if (mapped === "live" && mins >= 45 && mins <= 60) return "ht";
    if ((now - start) / 36e5 > 3) return "finished";
    if ((now - start) / 36e5 < -0.1) return "upcoming";
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

// 🔧 NOVA FUNKCIJA: Provjeri je li backend minuta svježa
export function isBackendMinuteFresh(
  match,
  maxAgeSeconds = DISPLAY_BACKEND_FRESH_SEC
) {
  if (!match.updated_at) return false;

  const lastUpdate = new Date(match.updated_at).getTime();
  const now = Date.now();
  const ageSeconds = (now - lastUpdate) / 1000;

  return ageSeconds <= maxAgeSeconds;
}

function formatMinute(minute) {
  if (minute <= 0) return "1'";
  if (minute >= 105 && minute <= 120) return `${minute}' (ET)`;
  if (minute >= 90) return `${minute}'+`;
  return `${minute}'`;
}

// 🚀 OPTIMIZACIJA: Cache da sprečimo ponavljanja
function getCacheKey(match) {
  return `${match.id}-${match.updated_at}-${Math.floor(Date.now() / 5000)}`;
}

// 🚀 POTPUNO NOVA LOGIKA: Jednostavna i pouzdana s CACHE
export function calculateDisplayMinute(match) {
  const status = validateLiveStatus(match);

  // Samo za live utakmice
  if (status !== "live") {
    return status === "ht" ? "HT" : null;
  }

  // 🔧 PROVJERI CACHE prvo
  const cacheKey = getCacheKey(match);
  if (minuteCache.has(cacheKey)) {
    return minuteCache.get(cacheKey);
  }

  let result;

  // 🎯 PRIORITET 1: Backend minuta (ako je svježa i valjana)
  if (hasValidBackendMinute(match) && isBackendMinuteFresh(match)) {
    result = formatMinute(match.minute);

    // 🔧 SMANJENO LOGIRANJE - samo povremeno
    if (Math.random() < 0.1) {
      // 10% šanse za log
      console.log(
        `✅ Using fresh backend minute: ${match.minute}' for ${match.home_team} vs ${match.away_team}`
      );
    }
  } else {
    // 🎯 PRIORITET 2: Real-time kalkulacija (jednostavna)
    const realTimeMinute = calculateSimpleRealTime(match);
    if (realTimeMinute) {
      result = realTimeMinute;

      if (Math.random() < 0.05) {
        // 5% šanse za log
        console.log(
          `⏰ Using real-time calculation: ${realTimeMinute} for ${match.home_team} vs ${match.away_team}`
        );
      }
    } else if (hasValidBackendMinute(match)) {
      // 🎯 PRIORITET 3: Backup - zastarjela backend minuta
      result = formatMinute(match.minute);

      if (Math.random() < 0.05) {
        console.log(
          `⚠️ Using stale backend minute: ${match.minute}' for ${match.home_team} vs ${match.away_team}`
        );
      }
    } else {
      // 🎯 FALLBACK: Generični LIVE indicator
      result = "LIVE";

      if (Math.random() < 0.02) {
        // 2% šanse za log
        console.log(
          `❌ No minute data available for ${match.home_team} vs ${match.away_team}, using LIVE`
        );
      }
    }
  }

  // 🔧 CACHE rezultat
  minuteCache.set(cacheKey, result);

  // 🔧 CLEANUP starih cache unosa
  if (minuteCache.size > 100) {
    const oldEntries = Array.from(minuteCache.keys()).slice(0, 50);
    oldEntries.forEach((key) => minuteCache.delete(key));
  }

  return result;
}

// 🔧 NOVA FUNKCIJA: Jednostavna real-time kalkulacija
function calculateSimpleRealTime(match) {
  try {
    const start = parseStart(match.start_time);
    if (Number.isNaN(start)) return null;

    const now = new Date();
    const minutesElapsed = Math.floor((now - start) / 60000);

    // Provjere osnovnih granica
    if (minutesElapsed < 0) return "1'";
    if (minutesElapsed > 150) return "90+"; // Preko 2.5h = vjerojatno greška

    // Jednostavna logika po vremenskim okvirima
    if (minutesElapsed <= 45) {
      // Prvi poluvrijeme (1-45')
      return `${Math.max(1, minutesElapsed)}'`;
    }

    if (minutesElapsed <= 60) {
      // Poluvrijeme/pauza (45-60')
      return "45+"; // Ili vraćaj "HT" ovisno o preferenci
    }

    if (minutesElapsed <= 105) {
      // Drugi poluvrijeme (60-105' = 46'-90' match time)
      const secondHalfMinute = 45 + (minutesElapsed - 60);
      return formatMinute(Math.min(secondHalfMinute, 90));
    }

    // Produžeci ili greška (preko 105')
    return "90+";
  } catch (error) {
    console.warn(`Error calculating real-time minute:`, error);
    return null;
  }
}

// 🔧 POBOLJŠANA: calculateRealTimeMinute - sada samo za debug
export function calculateRealTimeMinute(match, now = new Date()) {
  // Ova funkcija se zadržava za kompatibilnost, ali poziva novu logiku
  return calculateSimpleRealTime(match);
}

// --- debug helpers ---
export function analyzeMatchStatus(match) {
  const now = Date.now();
  const start = new Date(match.start_time).getTime();
  const hoursElapsed = Number.isFinite(start)
    ? ((now - start) / 36e5).toFixed(1)
    : "n/a";
  const validatedStatus = validateLiveStatus(match);

  // Debug informacije o minutama
  const backendMinute = hasValidBackendMinute(match)
    ? `${match.minute}'`
    : null;
  const backendFresh = isBackendMinuteFresh(match);
  const realTimeMinute = calculateSimpleRealTime(match);
  const displayMinute = calculateDisplayMinute(match);

  let minuteDiff = null;
  if (backendMinute && realTimeMinute && /^\d+/.test(realTimeMinute)) {
    minuteDiff = Math.abs(
      parseInt(backendMinute, 10) - parseInt(realTimeMinute, 10)
    );
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
      realtime: realTimeMinute,
      display: displayMinute,
      diffBackendVsRealtime: minuteDiff,
    },
    possibleIssues: {
      stale: !!isStale,
      veryOld: Number(hoursElapsed) > 2,
      noValidMinute: !backendMinute && !realTimeMinute,
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

// re-exports (za postojeći kod koji ih uvozi odavde)
export { getValidLiveMatches, getValidLiveMatchesStrict };
