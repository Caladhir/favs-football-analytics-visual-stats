// src/utils/matchSortingUtils.js - INTEGRIRANO S VAŠOM APLIKACIJOM

// Liga prioriteti (veći broj = veći prioritet)
const LEAGUE_PRIORITIES = {
  // UEFA natjecanja - najviši prioritet
  "UEFA Champions League": 120,
  "Champions League": 120,
  "UEFA Europa League": 110,
  "Europa League": 110,
  "UEFA Conference League": 100,
  "Conference League": 100,
  "UEFA Nations League": 95,
  "Nations League": 95,

  // Top 5 europskih liga
  "Premier League": 90,
  "English Premier League": 90,
  EPL: 90,
  "La Liga": 85,
  LaLiga: 85,
  "Serie A": 80,
  Bundesliga: 75,
  "Ligue 1": 70,

  // Ostala važna natjecanja
  "FIFA World Cup": 130,
  "World Cup": 130,
  "UEFA European Championship": 125,
  "European Championship": 125,
  "Euro 2024": 125,
  "Copa America": 85,
  "Africa Cup of Nations": 60,

  // Regionalne europske lige
  Eredivisie: 55,
  "Primeira Liga": 50,
  "Belgian Pro League": 45,
  "Jupiler Pro League": 45,
  "Scottish Premiership": 40,
  "Austrian Bundesliga": 35,
  "Swiss Super League": 32,
  "Danish Superliga": 30,
  "Norwegian Eliteserien": 28,
  "Swedish Allsvenskan": 26,

  // Balkanske lige
  HNL: 25, // Hrvatska
  "Prva Liga Srbije": 22,
  SuperLiga: 22,
  "Prva Liga BiH": 20,
  "Liga 1": 18, // Rumunjska
  "Bulgarian First League": 16,

  // Ostale intercontinentalne lige
  MLS: 25,
  "Major League Soccer": 25,
  "J1 League": 24,
  "K League 1": 22,
  "A-League": 20,
  Brasileirão: 65,
  "Serie A Brazil": 65,
  "Argentine Primera División": 45,

  // Kup natjecanja (niži prioritet od liga)
  "FA Cup": 35,
  "Copa del Rey": 40,
  "Coppa Italia": 38,
  "DFB-Pokal": 36,
  "Coupe de France": 34,

  // Default za nepoznate lige
  default: 10,
};

// Status prioriteti (veći broj = veći prioritet)
const STATUS_PRIORITIES = {
  live: 1000,
  inprogress: 1000,
  ht: 950,
  halftime: 950,
  upcoming: 100,
  notstarted: 100,
  finished: 50,
  afterextra: 45,
  penalties: 45,
  postponed: 10,
  canceled: 5,
  cancelled: 5,
  abandoned: 5,
  suspended: 8,
};

/**
 * Dobiva prioritet lige na temelju naziva (fuzzy matching)
 */
export function getLeaguePriority(competitionName) {
  if (!competitionName) return LEAGUE_PRIORITIES.default;

  const normalizedName = competitionName.toLowerCase().trim();

  // Exact match
  for (const [league, priority] of Object.entries(LEAGUE_PRIORITIES)) {
    if (normalizedName === league.toLowerCase()) {
      return priority;
    }
  }

  // Fuzzy matching za slučajeve kao "UEFA Champions League - Group Stage"
  for (const [league, priority] of Object.entries(LEAGUE_PRIORITIES)) {
    if (normalizedName.includes(league.toLowerCase())) {
      return priority;
    }
  }

  // Posebni slučajevi za vaš scraper
  if (normalizedName.includes("champions")) return 120;
  if (normalizedName.includes("europa")) return 110;
  if (normalizedName.includes("premier")) return 90;
  if (normalizedName.includes("bundesliga")) return 75;
  if (normalizedName.includes("serie a")) return 80;

  return LEAGUE_PRIORITIES.default;
}

/**
 * Dobiva prioritet statusa utakmice
 */
export function getStatusPriority(status) {
  if (!status) return STATUS_PRIORITIES.upcoming;

  const normalizedStatus = status.toLowerCase().trim();
  return STATUS_PRIORITIES[normalizedStatus] || STATUS_PRIORITIES.upcoming;
}

/**
 * Calculira vremenski prioritet za sortiranje
 */
export function getTimePriority(match, currentTime = new Date()) {
  const startTime = new Date(match.start_time);
  const timeDiff = startTime - currentTime;
  const hoursDiff = timeDiff / (1000 * 60 * 60);

  const status = match.status?.toLowerCase();

  // Live utakmice - najviši prioritet
  if (
    status === "live" ||
    status === "ht" ||
    status === "inprogress" ||
    status === "halftime"
  ) {
    // Dodatni bonus za utakmice s valjanim minutama
    const minuteBonus = match.minute && match.minute > 0 ? 50 : 0;
    return 1000 + minuteBonus;
  }

  // Nadolazeće utakmice u sljedećih 6 sati (skorašnje)
  if (hoursDiff > 0 && hoursDiff <= 6) {
    return 800 - hoursDiff * 20; // 800-680
  }

  // Nadolazeće utakmice danas (6-24h)
  if (hoursDiff > 6 && hoursDiff <= 24) {
    return 650 - hoursDiff * 5; // 650-530
  }

  // Završene utakmice iz zadnjih 6 sati
  if (hoursDiff < 0 && hoursDiff >= -6) {
    return 700 + hoursDiff * 10; // 700-640
  }

  // Završene utakmice iz zadnjih 24 sata
  if (hoursDiff < -6 && hoursDiff >= -24) {
    return 500 + hoursDiff * 5; // 500-380
  }

  // Nadolazeće utakmice u sljedećih 7 dana
  if (hoursDiff > 24 && hoursDiff <= 168) {
    return 400 - hoursDiff / 24; // 400-393
  }

  // Starije završene utakmice
  if (hoursDiff < -24) {
    return Math.max(200 - Math.abs(hoursDiff / 24), 50);
  }

  // Daleke nadolazeće utakmice
  return Math.max(300 - hoursDiff / 24, 100);
}

/**
 * Provjera je li utakmica korisnikov favorit
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
 * Glavna funkcija za sortiranje utakmica - KOMPATIBILNA S VAŠOM APP
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
    ],
    currentTime = new Date(),
    debugMode = false,
  } = options;

  if (!Array.isArray(matches) || matches.length === 0) {
    return matches;
  }

  const sorted = [...matches].sort((a, b) => {
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
    if (statusDiff !== 0) return statusDiff;

    // 3. Za utakmice istog statusa, sortiraj po vremenu
    const timeDiff =
      getTimePriority(b, currentTime) - getTimePriority(a, currentTime);
    if (Math.abs(timeDiff) > 1) return timeDiff;

    // 4. Liga prioritet (Top 5 lige > ostale)
    const leagueDiff =
      getLeaguePriority(b.competition) - getLeaguePriority(a.competition);
    if (leagueDiff !== 0) return leagueDiff;

    // 5. Za live utakmice, sortiraj po minuti (veća minuta = na vrh)
    const aIsLive = ["live", "ht", "inprogress", "halftime"].includes(
      a.status?.toLowerCase()
    );
    const bIsLive = ["live", "ht", "inprogress", "halftime"].includes(
      b.status?.toLowerCase()
    );

    if (aIsLive && bIsLive) {
      const aMinute = parseInt(a.minute) || 0;
      const bMinute = parseInt(b.minute) || 0;
      if (aMinute !== bMinute) return bMinute - aMinute;
    }

    // 6. Alfabetski po natjecanju kao fallback
    const competitionCompare = (a.competition || "").localeCompare(
      b.competition || ""
    );
    if (competitionCompare !== 0) return competitionCompare;

    // 7. Alfabetski po domaćem timu kao finalni fallback
    return (a.home_team || "").localeCompare(b.home_team || "");
  });

  // Debug output ako je potreban
  if (debugMode && typeof window !== "undefined") {
    console.group("🔄 Match Sorting Debug");
    sorted.slice(0, 5).forEach((match, index) => {
      console.log(`${index + 1}. ${match.home_team} vs ${match.away_team}`);
      console.log(
        `   📊 Liga: ${match.competition} (prioritet: ${getLeaguePriority(
          match.competition
        )})`
      );
      console.log(
        `   ⏱️ Status: ${match.status} (prioritet: ${getStatusPriority(
          match.status
        )})`
      );
      console.log(
        `   🕐 Vrijeme: ${new Date(
          match.start_time
        ).toLocaleTimeString()} (prioritet: ${getTimePriority(
          match,
          currentTime
        ).toFixed(1)})`
      );
      console.log("---");
    });
    console.groupEnd();
  }

  return sorted;
}

/**
 * Grupiraj utakmice po natjecanju uz zadržavanje sortiranja
 */
export function groupMatchesByCompetition(sortedMatches) {
  if (!Array.isArray(sortedMatches) || sortedMatches.length === 0) {
    return [];
  }

  const groups = new Map();

  sortedMatches.forEach((match) => {
    const competition = match.competition || "Unknown Competition";
    if (!groups.has(competition)) {
      groups.set(competition, []);
    }
    groups.get(competition).push(match);
  });

  // Vrati grupirane utakmice sortirane po prioritetu prve grupe
  return Array.from(groups.entries())
    .sort(([compA], [compB]) => {
      return getLeaguePriority(compB) - getLeaguePriority(compA);
    })
    .map(([competition, matches]) => ({
      competition,
      matches,
      priority: getLeaguePriority(competition),
      liveCount: matches.filter((m) =>
        ["live", "ht", "inprogress", "halftime"].includes(
          m.status?.toLowerCase()
        )
      ).length,
    }));
}

/**
 * Hook za dohvaćanje korisničkih preferencija (placeholder)
 * TODO: Implementiraj s vašim state managementom
 */
export function useUserPreferences() {
  // Za sada vraćaj default vrijednosti
  // Implementiraj s vašim Redux/Context/localStorage sustavom
  return {
    favoriteTeams: [], // npr. ['Arsenal', 'Dinamo Zagreb']
    favoriteLeagues: ["Premier League", "UEFA Champions League", "HNL"], // default top leagues
    sortingEnabled: true,
  };
}

/**
 * Utility za ažuriranje backend prioriteta (za vaš Python scraper)
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
