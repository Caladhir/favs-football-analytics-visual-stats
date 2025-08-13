// src/utils/liveMatchFilters.js - UNIFIED FILTERING LOGIC
import { normalizeStatus } from "./matchStatusUtils";
import { LIVE_STALE_SEC, MAX_LIVE_AGE_HOURS } from "../services/live";

// 🔧 UNIFIED: Live statusi koji se smatraju "live"
const LIVE_STATUSES = new Set(["live", "ht", "inprogress", "halftime"]);

// 🔧 UNIFIED: Ova funkcija će biti IDENTIČNA logici u Python scraper-u
const isMatchTooOld = (startTime, maxAgeHours = MAX_LIVE_AGE_HOURS) => {
  try {
    const startTimestamp = new Date(startTime).getTime();
    if (!Number.isFinite(startTimestamp)) return true;

    const hoursElapsed = (Date.now() - startTimestamp) / (1000 * 60 * 60);
    return hoursElapsed > maxAgeHours;
  } catch {
    return true;
  }
};

// 🔧 UNIFIED: Identična logika kao u Python scraper-u
const isMatchStale = (match, staleCutoffSec = LIVE_STALE_SEC) => {
  const status = normalizeStatus(match.status || match.status_type);

  // HT utakmice ne tretiramo kao stale (pauza)
  if (status === "ht") return false;

  if (!match.updated_at) return false; // Nema updated_at -> nije stale

  try {
    const lastUpdate = new Date(match.updated_at).getTime();
    if (!Number.isFinite(lastUpdate)) return false;

    const staleCutoffMs = staleCutoffSec * 1000;
    return Date.now() - lastUpdate > staleCutoffMs;
  } catch {
    return false;
  }
};

// 🚀 MAIN FUNCTION: Unified live match validation
export function getValidLiveMatchesUnified(matches, options = {}) {
  const {
    staleCutoffSec = LIVE_STALE_SEC,
    maxAgeHours = MAX_LIVE_AGE_HOURS,
    strict = true, // Dodano za kompatibilnost
  } = options;

  if (!Array.isArray(matches)) return [];

  console.log(`🔍 Filtering ${matches.length} matches (strict: ${strict})`);

  const validMatches = matches.filter((match) => {
    // 1. Provjeri status
    const normalizedStatus = normalizeStatus(match.status || match.status_type);
    const isLiveStatus = LIVE_STATUSES.has(normalizedStatus);

    if (!isLiveStatus) {
      return false;
    }

    // 2. Provjeri age (isto kao scraper)
    if (isMatchTooOld(match.start_time, maxAgeHours)) {
      console.log(`❌ Too old: ${match.home_team} vs ${match.away_team}`);
      return false;
    }

    // 3. Provjeri staleness (samo u strict mode)
    if (strict && isMatchStale(match, staleCutoffSec)) {
      console.log(`❌ Stale: ${match.home_team} vs ${match.away_team}`);
      return false;
    }

    return true;
  });

  console.log(
    `✅ Valid live matches: ${validMatches.length}/${matches.length}`
  );

  // 🔧 DEBUG: Prikaži breakdown po ligama
  if (import.meta.env.DEV && validMatches.length > 0) {
    const leagueBreakdown = validMatches.reduce((acc, match) => {
      const league = match.competition || "Unknown";
      acc[league] = (acc[league] || 0) + 1;
      return acc;
    }, {});

    console.log("🏆 Live matches by league:", leagueBreakdown);
  }

  return validMatches;
}

// 🔧 COMPATIBILITY: Stari API-ji
export function getValidLiveMatches(matches) {
  return getValidLiveMatchesUnified(matches, {
    staleCutoffSec: LIVE_STALE_SEC,
    maxAgeHours: MAX_LIVE_AGE_HOURS,
    strict: true,
  });
}

export function getValidLiveMatchesStrict(matches, opts = {}) {
  return getValidLiveMatchesUnified(matches, {
    ...opts,
    strict: true,
  });
}

// 🚀 NOVO: Relaxed verzija za debug/test
export function getValidLiveMatchesRelaxed(matches, opts = {}) {
  return getValidLiveMatchesUnified(matches, {
    staleCutoffSec: 600, // 10 minuta umjesto 5
    maxAgeHours: 6, // 6 sati umjesto 3
    strict: false,
    ...opts,
  });
}

// 🔧 UTILITY: Compare different filters
export function compareFilters(matches) {
  const strict = getValidLiveMatchesStrict(matches);
  const relaxed = getValidLiveMatchesRelaxed(matches);
  const all = matches.filter((m) =>
    LIVE_STATUSES.has(normalizeStatus(m.status || m.status_type))
  );

  console.group("🔍 Filter Comparison");
  console.log(`📊 All live status: ${all.length}`);
  console.log(`📊 Strict filter: ${strict.length}`);
  console.log(`📊 Relaxed filter: ${relaxed.length}`);

  const onlyInRelaxed = relaxed.filter(
    (m) => !strict.find((s) => s.id === m.id)
  );
  if (onlyInRelaxed.length > 0) {
    console.log(`⚠️ Only in relaxed (${onlyInRelaxed.length}):`);
    onlyInRelaxed.forEach((m) => {
      console.log(`  - ${m.home_team} vs ${m.away_team} (${m.status})`);
    });
  }
  console.groupEnd();

  return { strict, relaxed, all };
}
