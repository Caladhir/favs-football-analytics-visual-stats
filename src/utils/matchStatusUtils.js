// src/utils/matchStatusUtils.js - ISPRAVKA ZA PRODUŽETKE
import { DISPLAY_BACKEND_FRESH_SEC, LIVE_STALE_SEC } from "../services/live";
import {
  getValidLiveMatches,
  getValidLiveMatchesStrict,
} from "./liveMatchFilters";

const LIVE_SET = new Set(["live", "ht", "inprogress", "halftime"]);

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

function fmt(m) {
  if (m >= 105 && m <= 120) return `${m}' (ET)`;
  if (m >= 90) return `${m}'+`;
  return `${m}'`;
}

// 🚀 ISPRAVKA: Bolja logika za produžetke
export function calculateRealTimeMinute(match, now = new Date()) {
  const status = validateLiveStatus(match);
  if (status !== "live" && status !== "ht") return null;
  if (status === "ht") return "45'";

  const start = parseStart(match.start_time);
  if (Number.isNaN(start)) return null;

  const fromStart = Math.floor((now - start) / 60000);

  // 🚀 GLAVNA ISPRAVKA: Provjeri da li backend minuta pokazuje produžetke
  const hasBackendExtraTime = hasValidBackendMinute(match) && match.minute > 90;

  const cps = match.current_period_start
    ? new Date(match.current_period_start * 1000)
    : null;

  if (cps && !Number.isNaN(cps)) {
    const fromPeriod = Math.floor((now - cps) / 60000);

    // Prvi poluvrijeme (0-45')
    if (fromStart <= 50) return `${Math.max(1, Math.min(fromPeriod, 45))}'`;

    // Poluvrijeme (45-60')
    if (fromStart <= 60) return "45+";

    // Drugo poluvrijeme (60-105') - ALI bez produžetaka osim ako backend ne kaže drugačije
    if (fromStart <= 105) {
      const secondHalfMinute = Math.min(45 + Math.max(1, fromPeriod), 90);

      // 🚀 NOVA LOGIKA: Ako nema backend produžetaka, zaustavi na 90+
      if (secondHalfMinute >= 90 && !hasBackendExtraTime) {
        return "90+";
      }

      return fmt(secondHalfMinute);
    }

    // Produžeci (105-120') - SAMO ako backend potvrđuje
    if (fromStart <= 120 && hasBackendExtraTime) {
      return `${Math.min(90 + Math.max(1, fromPeriod), 120)}' (ET)`;
    }

    // Fallback
    return hasBackendExtraTime ? "90+ (ET)" : "90+";
  }

  // Bez current_period_start - jednostavnija logika
  if (fromStart < 0) return "1'";
  if (fromStart <= 45) return `${Math.max(1, fromStart)}'`;
  if (fromStart <= 60) return "45+";

  // 🚀 KLJUČNA PROMJENA: Drugo poluvrijeme bez automatskih produžetaka
  if (fromStart <= 105) {
    const minute = 45 + (fromStart - 60);

    // Ako je preko 90', provjeri backend
    if (minute >= 90 && !hasBackendExtraTime) {
      return "90+";
    }

    return fmt(minute);
  }

  // Produžeci SAMO ako backend potvrđuje
  if (fromStart <= 120 && hasBackendExtraTime) {
    return `${90 + (fromStart - 105)}' (ET)`;
  }

  // Default fallback
  return hasBackendExtraTime ? "90+ (ET)" : "90+";
}

export function calculateDisplayMinute(match) {
  const s = validateLiveStatus(match);
  if (s !== "live" && s !== "ht") return null;

  const fresh =
    match.updated_at &&
    Date.now() - new Date(match.updated_at).getTime() <=
      DISPLAY_BACKEND_FRESH_SEC * 1000;

  // 🚀 POBOLJŠANJE: Uvijek prioritiziraj real-time, backend samo za pohranu
  if (s === "ht") return "45'";

  const realTimeMinute = calculateRealTimeMinute(match);

  // Koristi backend samo ako je svjež I ako real-time nije dostupan
  if (hasValidBackendMinute(match) && fresh && !realTimeMinute) {
    return fmt(match.minute);
  }

  return realTimeMinute;
}

// --- debug helpers ---
export function analyzeMatchStatus(match) {
  const now = Date.now();
  const start = new Date(match.start_time).getTime();
  const hoursElapsed = Number.isFinite(start)
    ? ((now - start) / 36e5).toFixed(1)
    : "n/a";
  const validatedStatus = validateLiveStatus(match);
  const realtime = calculateRealTimeMinute(match);
  const backend = hasValidBackendMinute(match) ? `${match.minute}'` : null;

  let diff = null;
  if (backend && realtime && /^\d+/.test(realtime)) {
    diff = Math.abs(parseInt(backend, 10) - parseInt(realtime, 10));
  }

  const isStale =
    match.updated_at &&
    now - new Date(match.updated_at).getTime() > LIVE_STALE_SEC * 1000;

  return {
    originalStatus: match.status || match.status_type,
    validatedStatus,
    hoursElapsed,
    minute: { backend, realtime, diffBackendVsRealtime: diff },
    possibleIssues: {
      stale: !!isStale,
      veryOld: Number(hoursElapsed) > 2,
      hasBackendExtraTime: hasValidBackendMinute(match) && match.minute > 90,
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
