// src/utils/matchSortingUtils.js - ENHANCED VERSION 2.0

// Liga prioriteti (optimized with better categorization)
const LEAGUE_PRIORITIES = {
  // UEFA natjecanja - najviši prioritet (120-130)
  "UEFA Champions League": 130,
  "Champions League": 130,
  "UEFA Europa League": 120,
  "Europa League": 120,
  "UEFA Conference League": 115,
  "Conference League": 115,
  "UEFA Nations League": 110,
  "Nations League": 110,

  // Svjetska natjecanja (130-140)
  "FIFA World Cup": 140,
  "World Cup": 140,
  "UEFA European Championship": 135,
  "European Championship": 135,
  "Euro 2024": 135,
  "Euro 2028": 135,

  // Top 5 europskih liga (80-100)
  "Premier League": 100,
  "English Premier League": 100,
  EPL: 100,
  "La Liga": 95,
  LaLiga: 95,
  "Serie A": 90,
  Bundesliga: 85,
  "Ligue 1": 80,

  // Velika intercontinentalna natjecanja (70-90)
  "Copa America": 90,
  "Copa Libertadores": 85,
  "Copa Sudamericana": 75,
  "CAF Champions League": 70,
  "AFC Champions League": 70,
  "CONCACAF Champions League": 65,

  // Drugi tier europske lige (40-70)
  Eredivisie: 65,
  "Primeira Liga": 60,
  "Belgian Pro League": 55,
  "Jupiler Pro League": 55,
  "Scottish Premiership": 50,
  "Austrian Bundesliga": 45,
  "Swiss Super League": 42,
  "Danish Superliga": 40,

  // Treći tier europske lige (25-40)
  "Norwegian Eliteserien": 38,
  "Swedish Allsvenskan": 36,
  "Czech Liga": 34,
  "Polish Ekstraklasa": 32,
  "Ukrainian Premier League": 30,
  "Russian Premier League": 28,

  // Balkanske lige (20-30)
  HNL: 60, // Hrvatska - povećano
  "Prva Liga Srbije": 26,
  SuperLiga: 26,
  "Prva Liga BiH": 24,
  "Liga 1": 22, // Rumunjska
  "Bulgarian First League": 20,
  "North Macedonia First League": 18,

  // Ostale intercontinentalne lige (25-70)
  Brasileirão: 75,
  "Serie A Brazil": 75,
  "Argentine Primera División": 70,
  MLS: 35,
  "Major League Soccer": 35,
  "J1 League": 32,
  "K League 1": 30,
  "A-League": 28,
  "Chinese Super League": 25,

  // Kup natjecanja (30-50)
  "FA Cup": 45,
  "Copa del Rey": 50,
  "Coppa Italia": 48,
  "DFB-Pokal": 46,
  "Coupe de France": 44,
  "Carabao Cup": 35,
  "Community Shield": 30,

  // Međународni kupovi (60-80)
  "UEFA Super Cup": 80,
  "FIFA Club World Cup": 85,
  "Copa del Mundo de Clubes": 85,

  // Default za nepoznate lige
  default: 10,
};

// Status prioriteti (optimized)
const STATUS_PRIORITIES = {
  live: 1000,
  inprogress: 1000,
  ht: 980, // Malo niži od live za better sorting
  halftime: 980,
  upcoming: 100,
  notstarted: 100,
  scheduled: 100,
  finished: 50,
  ft: 50,
  afterextra: 45,
  penalties: 45,
  postponed: 15,
  delayed: 15,
  canceled: 10,
  cancelled: 10,
  abandoned: 8,
  suspended: 12,
  interrupted: 12,
};

// Memoization cache for performance
const priorityCache = new Map();
const sortCache = new Map();

/**
 * Enhanced league priority with fuzzy matching and caching
 */
export function getLeaguePriority(competitionName) {
  if (!competitionName) return LEAGUE_PRIORITIES.default;

  // Check cache first
  if (priorityCache.has(competitionName)) {
    return priorityCache.get(competitionName);
  }

  const normalizedName = competitionName.toLowerCase().trim();
  let priority = LEAGUE_PRIORITIES.default;

  // Exact match (highest priority)
  for (const [league, leaguePriority] of Object.entries(LEAGUE_PRIORITIES)) {
    if (normalizedName === league.toLowerCase()) {
      priority = leaguePriority;
      break;
    }
  }

  // Fuzzy matching if no exact match
  if (priority === LEAGUE_PRIORITIES.default) {
    for (const [league, leaguePriority] of Object.entries(LEAGUE_PRIORITIES)) {
      if (normalizedName.includes(league.toLowerCase())) {
        priority = leaguePriority;
        break;
      }
    }
  }

  // Advanced pattern matching for common cases
  if (priority === LEAGUE_PRIORITIES.default) {
    if (normalizedName.includes("champions")) {
      priority = normalizedName.includes("uefa") ? 130 : 70;
    } else if (normalizedName.includes("europa")) {
      priority = 120;
    } else if (normalizedName.includes("premier")) {
      priority = 100;
    } else if (normalizedName.includes("bundesliga")) {
      priority = 85;
    } else if (normalizedName.includes("serie a")) {
      priority = 90;
    } else if (normalizedName.includes("la liga")) {
      priority = 95;
    } else if (normalizedName.includes("ligue 1")) {
      priority = 80;
    } else if (
      normalizedName.includes("cup") ||
      normalizedName.includes("copa")
    ) {
      priority = 35; // Generic cup priority
    }
  }

  // Cache the result
  priorityCache.set(competitionName, priority);
  return priority;
}

/**
 * Enhanced status priority
 */
export function getStatusPriority(status) {
  if (!status) return STATUS_PRIORITIES.upcoming;

  const normalizedStatus = status.toLowerCase().trim();
  // Ensure finished-like statuses map to a low priority
  if (
    ["finished", "ft", "afterextra", "penalties"].includes(normalizedStatus)
  ) {
    return STATUS_PRIORITIES.finished || 50;
  }
  return STATUS_PRIORITIES[normalizedStatus] || STATUS_PRIORITIES.upcoming;
}

// Utility for other modules: is this considered a live status?
export function isLiveStatus(status) {
  if (!status) return false;
  const s = status.toLowerCase().trim();
  return ["live", "ht", "inprogress", "halftime"].includes(s);
}

/**
 * Enhanced time priority calculation
 */
export function getTimePriority(match, currentTime = new Date()) {
  const startTime = new Date(match.start_time);
  const timeDiff = startTime - currentTime;
  const hoursDiff = timeDiff / (1000 * 60 * 60);
  const status = match.status?.toLowerCase();

  // Live utakmice - najviši prioritet s bonus za minutu
  if (["live", "ht", "inprogress", "halftime"].includes(status)) {
    let liveBonus = 1000;

    // Bonus za minute - veća minuta = više na vrhu
    if (match.minute && match.minute > 0) {
      liveBonus += Math.min(match.minute, 120); // Max 120 bonus
    }

    // Extra bonus za dramatic minutes
    if (match.minute >= 85 || (match.minute >= 40 && match.minute <= 45)) {
      liveBonus += 50; // Drama bonus
    }

    return liveBonus;
  }

  // Nadolazeće utakmice - čim bliže, veći prioritet
  if (hoursDiff > 0) {
    if (hoursDiff <= 1) return 900 - hoursDiff * 50; // Next hour: 900-850
    if (hoursDiff <= 3) return 850 - hoursDiff * 20; // Next 3h: 850-790
    if (hoursDiff <= 6) return 800 - hoursDiff * 15; // Next 6h: 800-710
    if (hoursDiff <= 24) return 700 - hoursDiff * 5; // Today: 700-580
    if (hoursDiff <= 72) return 500 - hoursDiff * 2; // Next 3 days: 500-356
    if (hoursDiff <= 168) return 300 - hoursDiff * 1; // Next week: 300-132
    return Math.max(100 - hoursDiff / 24, 50); // Future: declining
  }

  // Završene utakmice - čim skorije, veći prioritet
  if (hoursDiff < 0) {
    const hoursAgo = Math.abs(hoursDiff);
    if (hoursAgo <= 3) return 750 - hoursAgo * 50; // Last 3h: 750-600
    if (hoursAgo <= 12) return 600 - hoursAgo * 20; // Last 12h: 600-360
    if (hoursAgo <= 24) return 400 - hoursAgo * 10; // Yesterday: 400-160
    if (hoursAgo <= 72) return 200 - hoursAgo * 2; // Last 3 days: 200-56
    return Math.max(100 - hoursAgo * 1, 10); // Older: declining
  }

  return 100; // Fallback
}

/**
 * Enhanced duplicate detection and removal
 */
function removeDuplicateMatches(matches) {
  const seen = new Set();
  const deduped = [];

  for (const match of matches) {
    // Create a unique signature for each match
    const signature = [
      match.id,
      match.home_team?.toLowerCase(),
      match.away_team?.toLowerCase(),
      match.start_time,
      match.competition?.toLowerCase(),
    ]
      .filter(Boolean)
      .join("|");

    if (!seen.has(signature)) {
      seen.add(signature);
      deduped.push(match);
    }
  }

  if (matches.length !== deduped.length) {
    console.warn(
      `🔧 Removed ${matches.length - deduped.length} duplicate matches`
    );
  }

  return deduped;
}

/**
 * Check if match is user favorite
 */
export function isUserFavorite(
  match,
  favoriteTeams = [],
  favoriteLeagues = []
) {
  const isFavoriteTeam = favoriteTeams.some(
    (team) =>
      team.toLowerCase() === match.home_team?.toLowerCase() ||
      team.toLowerCase() === match.away_team?.toLowerCase()
  );

  const isFavoriteLeague = favoriteLeagues.some(
    (league) => league.toLowerCase() === match.competition?.toLowerCase()
  );

  return isFavoriteTeam || isFavoriteLeague;
}

/**
 * Enhanced match sorting with deduplication and caching
 */
export function sortMatches(matches, options = {}) {
  const {
    prioritizeUserFavorites = true,
    favoriteTeams = [],
    favoriteLeagues = [
      "Premier League",
      "La Liga",
      "Serie A",
      "Bundesliga",
      "Ligue 1",
      "HNL",
    ],
    currentTime = new Date(),
    debugMode = false,
    cacheable = true,
  } = options;

  if (!Array.isArray(matches) || matches.length === 0) {
    return matches;
  }

  // Create cache key for performance
  const cacheKey = cacheable
    ? `${matches.length}-${currentTime.getTime()}-${JSON.stringify(
        favoriteTeams
      )}-${JSON.stringify(favoriteLeagues)}`
    : null;

  if (cacheable && cacheKey && sortCache.has(cacheKey)) {
    return sortCache.get(cacheKey);
  }

  // Step 1: Remove duplicates first
  const dedupedMatches = removeDuplicateMatches(matches);

  // Step 2: Sort with enhanced logic
  const sorted = [...dedupedMatches].sort((a, b) => {
    // 1. User favorites (ako je uključeno)
    if (
      prioritizeUserFavorites &&
      (favoriteTeams.length > 0 || favoriteLeagues.length > 0)
    ) {
      const aIsFavorite = isUserFavorite(a, favoriteTeams, favoriteLeagues);
      const bIsFavorite = isUserFavorite(b, favoriteTeams, favoriteLeagues);

      if (aIsFavorite !== bIsFavorite) {
        return bIsFavorite ? 1 : -1;
      }
    }

    // 2. Status prioritet (live > upcoming > finished)
    const statusDiff =
      getStatusPriority(b.status) - getStatusPriority(a.status);
    if (Math.abs(statusDiff) > 10) return statusDiff;

    // 3. Za live utakmice, prioritiziraj po vremenu i minuti
    const aIsLive = ["live", "ht", "inprogress", "halftime"].includes(
      a.status?.toLowerCase()
    );
    const bIsLive = ["live", "ht", "inprogress", "halftime"].includes(
      b.status?.toLowerCase()
    );

    if (aIsLive && bIsLive) {
      // Prvo po ligi (veći prioritet = na vrh)
      const leagueDiff =
        getLeaguePriority(b.competition) - getLeaguePriority(a.competition);
      if (Math.abs(leagueDiff) > 5) return leagueDiff;

      // Zatim po minuti (veća minuta = na vrh za drama)
      const aMinute = parseInt(a.minute) || 0;
      const bMinute = parseInt(b.minute) || 0;
      if (Math.abs(aMinute - bMinute) > 5) return bMinute - aMinute;
    }

    // 4. Vremenski prioritet (skorije = bolje)
    const timeDiff =
      getTimePriority(b, currentTime) - getTimePriority(a, currentTime);
    if (Math.abs(timeDiff) > 5) return timeDiff;

    // 5. Liga prioritet (boljih liga = na vrh)
    const leagueDiff =
      getLeaguePriority(b.competition) - getLeaguePriority(a.competition);
    if (Math.abs(leagueDiff) > 2) return leagueDiff;

    // 6. Alfabetski po natjecanju
    const competitionCompare = (a.competition || "").localeCompare(
      b.competition || ""
    );
    if (competitionCompare !== 0) return competitionCompare;

    // 7. Alfabetski po domaćem timu
    return (a.home_team || "").localeCompare(b.home_team || "");
  });

  // Cache result for performance
  if (cacheable && cacheKey) {
    sortCache.set(cacheKey, sorted);

    // Clean cache if it gets too big
    if (sortCache.size > 50) {
      const firstKey = sortCache.keys().next().value;
      sortCache.delete(firstKey);
    }
  }

  // Debug output (throttled to prevent spam)
  if (debugMode && typeof window !== "undefined") {
    const now = Date.now();
    const lastDebug = window.lastSortDebug || 0;

    if (now - lastDebug > 5000) {
      // Only debug every 5 seconds
      window.lastSortDebug = now;

      console.group("🔄 Enhanced Match Sorting Debug");
      console.log(
        `📊 Total: ${matches.length} → Deduped: ${dedupedMatches.length} → Sorted: ${sorted.length}`
      );

      // Show top 5 matches with detailed info
      sorted.slice(0, 5).forEach((match, index) => {
        const isFav = isUserFavorite(match, favoriteTeams, favoriteLeagues);
        const timePrio = getTimePriority(match, currentTime);
        const statusPrio = getStatusPriority(match.status);
        const leaguePrio = getLeaguePriority(match.competition);

        console.log(
          `${index + 1}. ${match.home_team} vs ${match.away_team} ${
            isFav ? "❤️" : ""
          }`
        );
        console.log(`   📊 ${match.competition} (L:${leaguePrio})`);
        console.log(
          `   ⏱️ ${match.status} (S:${statusPrio}) ${
            match.minute ? `[${match.minute}']` : ""
          }`
        );
        console.log(
          `   🕐 ${new Date(
            match.start_time
          ).toLocaleTimeString()} (T:${timePrio.toFixed(1)})`
        );
        console.log(`   🆔 ${match.id}`);
        console.log("---");
      });

      // Show statistics
      const liveCount = sorted.filter((m) =>
        ["live", "ht", "inprogress", "halftime"].includes(
          m.status?.toLowerCase()
        )
      ).length;
      const topLeagueCount = sorted.filter(
        (m) => getLeaguePriority(m.competition) >= 80
      ).length;
      const favoriteCount = sorted.filter((m) =>
        isUserFavorite(m, favoriteTeams, favoriteLeagues)
      ).length;

      console.log(
        `📈 Stats: ${liveCount} live, ${topLeagueCount} top leagues, ${favoriteCount} favorites`
      );
      console.groupEnd();
    }
  }

  return sorted;
}

/**
 * Enhanced competition grouping with better sorting
 */
export function groupMatchesByCompetition(sortedMatches) {
  if (!Array.isArray(sortedMatches) || sortedMatches.length === 0) {
    return [];
  }

  const groups = new Map();

  // Group matches by competition
  sortedMatches.forEach((match) => {
    const competition = match.competition || "Unknown Competition";
    if (!groups.has(competition)) {
      groups.set(competition, []);
    }
    groups.get(competition).push(match);
  });

  // Convert to array with enhanced metadata
  const groupArray = Array.from(groups.entries()).map(
    ([competition, matches]) => {
      const priority = getLeaguePriority(competition);
      const liveCount = matches.filter((m) =>
        ["live", "ht", "inprogress", "halftime"].includes(
          m.status?.toLowerCase()
        )
      ).length;
      const upcomingCount = matches.filter((m) =>
        ["upcoming", "notstarted", "scheduled"].includes(
          m.status?.toLowerCase()
        )
      ).length;
      const finishedCount = matches.length - liveCount - upcomingCount;

      return {
        competition,
        matches,
        priority,
        liveCount,
        upcomingCount,
        finishedCount,
        totalCount: matches.length,
      };
    }
  );

  // Sort groups by priority, then by live count
  return groupArray.sort((a, b) => {
    // First by priority
    const priorityDiff = b.priority - a.priority;
    if (priorityDiff !== 0) return priorityDiff;

    // Then by live count
    const liveDiff = b.liveCount - a.liveCount;
    if (liveDiff !== 0) return liveDiff;

    // Finally alphabetically
    return a.competition.localeCompare(b.competition);
  });
}

/**
 * Enhanced user preferences hook
 */
export function useUserPreferences() {
  // Enhanced default preferences
  return {
    favoriteTeams: [], // e.g., ['Arsenal', 'Dinamo Zagreb', 'Hajduk Split']
    favoriteLeagues: [
      "Premier League",
      "UEFA Champions League",
      "UEFA Europa League",
      "HNL", // Croatian league
      "La Liga",
      "Serie A",
      "Bundesliga",
    ],
    sortingEnabled: true,
    showLivePriority: true,
    groupByDefault: false,
    enableCache: true,
  };
}

/**
 * Performance monitoring utilities
 */
export function clearSortingCache() {
  sortCache.clear();
  priorityCache.clear();
  console.log("🧹 Sorting caches cleared");
}

export function getSortingStats() {
  return {
    sortCacheSize: sortCache.size,
    priorityCacheSize: priorityCache.size,
    totalCacheEntries: sortCache.size + priorityCache.size,
  };
}

/**
 * Utility for generating backend priority updates
 */
export function generateLeaguePrioritySQL() {
  const sql = Object.entries(LEAGUE_PRIORITIES)
    .filter(([key]) => key !== "default")
    .map(
      ([league, priority]) =>
        `UPDATE competitions SET priority = ${priority} WHERE name ILIKE '%${league}%';`
    )
    .join("\n");

  console.log("SQL za ažuriranje prioriteta liga:");
  console.log(sql);
  return sql;
}

/**
 * Export individual utilities for testing
 */
export {
  LEAGUE_PRIORITIES,
  STATUS_PRIORITIES,
  removeDuplicateMatches as _removeDuplicateMatches, // Private but exported for testing
};
