// src/utils/matchStatusUtils.js - POPRAVLJENA VERZIJA ZA LIVE PRIKAZ
// Konzistentni status mapping s backendom
const STATUS_MAPPING = {
  // Live statusi
  live: "live",
  inplay: "live",
  "1h": "live",
  "2h": "live",
  "1st_half": "live",
  "2nd_half": "live",
  inprogress: "live",

  // Half-time
  ht: "ht",
  halftime: "ht",
  half_time: "ht",

  // Upcoming
  upcoming: "upcoming",
  not_started: "upcoming",
  scheduled: "upcoming",
  ns: "upcoming",
  notstarted: "upcoming",

  // Finished
  finished: "finished",
  ft: "finished",
  full_time: "finished",
  ended: "finished",
  afterextra: "finished",
  penalties: "finished",

  // Other
  canceled: "canceled",
  cancelled: "canceled",
  postponed: "postponed",
  pp: "postponed",
  abandoned: "abandoned",
  ab: "abandoned",
  suspended: "suspended",
  susp: "suspended",
};

/**
 * Normalizira status utakmice prema definiranom mappingu
 * @param {string} status - Originalni status iz baze
 * @returns {string} Normalizirani status
 */
export function normalizeStatus(status) {
  if (!status) return "upcoming";
  return STATUS_MAPPING[status.toLowerCase()] || status.toLowerCase();
}

/**
 * Validira live status utakmice i ispravlja greške
 * @param {Object} match - Objekt utakmice
 * @returns {string} Validirani status
 */
export function validateLiveStatus(match) {
  const now = new Date();
  const startTime = new Date(match.start_time);
  const timeSinceStart = now - startTime;
  const hoursElapsed = timeSinceStart / (1000 * 60 * 60);

  const normalizedStatus = normalizeStatus(match.status);

  // Ako je utakmica označena kao live, ali je prošlo više od 3 sata
  if (
    (normalizedStatus === "live" || normalizedStatus === "ht") &&
    hoursElapsed > 3
  ) {
    console.warn(
      `🚨 ZOMBIE MATCH DETECTED: ${match.home_team} vs ${match.away_team}`,
      {
        status: match.status,
        startTime: match.start_time,
        hoursElapsed: hoursElapsed.toFixed(1),
      }
    );
    return "finished"; // Override status
  }

  // Ako je utakmica u budućnosti, ali označena kao live
  if (
    startTime > now &&
    (normalizedStatus === "live" || normalizedStatus === "ht")
  ) {
    console.warn(
      `⏰ FUTURE MATCH MARKED AS LIVE: ${match.home_team} vs ${match.away_team}`
    );
    return "upcoming"; // Override status
  }

  return normalizedStatus;
}

/**
 * 🔧 NOVA LOGIKA: Provjeri je li backend minuta pouzdana
 * @param {Object} match - Objekt utakmice
 * @returns {boolean} Je li minuta pouzdana
 */
function isBackendMinuteReliable(match) {
  const dbMinute = match.minute;

  // Ako nema minute u bazi
  if (typeof dbMinute !== "number" || isNaN(dbMinute) || dbMinute <= 0) {
    return false;
  }

  // Provjeri je li minuta realna u odnosu na vrijeme početka
  const now = new Date();
  const startTime = new Date(match.start_time);
  const minutesFromStart = Math.floor((now - startTime) / (1000 * 60));

  // Ako je backend minuta previše različita od stvarnog vremena, nije pouzdana
  const difference = Math.abs(dbMinute - minutesFromStart);

  // Ako je razlika veća od 20 minuta, vjerojatno je greška
  if (difference > 20) {
    console.warn(
      `⚠️ Backend minute ${dbMinute}' vs real time ${minutesFromStart}' - difference too large (${difference}m)`
    );
    return false;
  }

  // Ako je minuta preko 120, nije realna
  if (dbMinute > 120) {
    console.warn(`⚠️ Backend minute ${dbMinute}' too high - not reliable`);
    return false;
  }

  return true;
}

/**
 * 🔧 POBOLJŠANA: Preferira backend minute, ali samo ako su pouzdane
 * @param {Object} match - Objekt utakmice
 * @returns {number|string|null} Minuta utakmice ili null ako nije live
 */
export function calculateDisplayMinute(match) {
  const validatedStatus = validateLiveStatus(match);

  // Samo za live utakmice prikazuj minutu
  if (validatedStatus !== "live" && validatedStatus !== "ht") {
    return null;
  }

  // 🎯 NOVA LOGIKA: Provjeri pouzdanost backend minute
  const isReliable = isBackendMinuteReliable(match);
  const dbMinute = match.minute;

  if (isReliable && typeof dbMinute === "number") {
    console.log(
      `✅ Using reliable backend minute: ${dbMinute}' for ${match.home_team} vs ${match.away_team}`
    );

    // Formatiraj minutu za prikaz
    if (dbMinute >= 105) return `${dbMinute}' (ET)`;
    if (dbMinute >= 90) return `${dbMinute}'+`;
    return `${dbMinute}'`;
  }

  // 🔧 NOVA STRATEGIJA: Ako backend minuta nije pouzdana, prikaži samo "LIVE"
  if (!isReliable) {
    console.warn(
      `⚠️ Backend minute not reliable for ${match.home_team} vs ${match.away_team} - showing LIVE`
    );
    return "LIVE";
  }

  // 🚨 FALLBACK: Samo ako backend baš nema minutu
  console.warn(
    `⚠️ No backend minute for ${match.home_team} vs ${match.away_team} - showing LIVE`
  );
  return "LIVE";
}

/**
 * Provjera ima li utakmica validne live utakmice za timer
 * @param {Array} matches - Niz utakmica
 * @returns {Array} Niz validnih live utakmica
 */
export function getValidLiveMatches(matches) {
  return matches.filter((match) => {
    const validatedStatus = validateLiveStatus(match);
    return validatedStatus === "live" || validatedStatus === "ht";
  });
}

/**
 * Pronalazi problematične utakmice za debugging
 * @param {Array} matches - Niz utakmica
 * @returns {Array} Niz problematičnih utakmica
 */
export function findProblemMatches(matches) {
  const now = new Date();

  return matches.filter((match) => {
    const normalizedStatus = normalizeStatus(match.status);
    const startTime = new Date(match.start_time);
    const hoursElapsed = (now - startTime) / (1000 * 60 * 60);

    return (
      (normalizedStatus === "live" || normalizedStatus === "ht") &&
      hoursElapsed > 2
    );
  });
}

/**
 * 🔧 POBOLJŠANA: Formatira status tekst za prikaz
 * @param {string} status - Status utakmice
 * @param {Object} match - Objekt utakmice (za minutu)
 * @returns {string} Formatiran status tekst
 */
export function getDisplayStatusText(status, match) {
  const validatedStatus = validateLiveStatus(match);

  switch (validatedStatus) {
    case "ht":
      return "HT";
    case "live": {
      const displayMinute = calculateDisplayMinute(match);
      return displayMinute || "LIVE";
    }
    case "finished":
      return "FT";
    case "canceled":
      return "OTKAZANO";
    case "postponed":
      return "ODGOĐENO";
    case "abandoned":
      return "PREKID";
    case "suspended":
      return "PAUZA";
    default:
      return match.status || "N/A";
  }
}

/**
 * 🔧 DEBUG HELPER: Provjeri kvalitetu backend podataka
 * @param {Array} matches - Niz utakmica
 */
export function debugBackendMinutes(matches) {
  if (!import.meta.env.DEV) return;

  const liveMatches = matches.filter((m) => {
    const status = validateLiveStatus(m);
    return status === "live" || status === "ht";
  });

  console.group("🔍 Backend Minutes Debug");

  liveMatches.forEach((match) => {
    const hasBackendMinute =
      typeof match.minute === "number" && !isNaN(match.minute);
    const isReliable = isBackendMinuteReliable(match);
    const now = new Date();
    const startTime = new Date(match.start_time);
    const minutesFromStart = Math.floor((now - startTime) / (1000 * 60));

    console.log(`${match.home_team} vs ${match.away_team}:`);
    console.log(
      `  Backend minute: ${
        hasBackendMinute ? match.minute + "'" : "❌ MISSING"
      }`
    );
    console.log(`  Is reliable: ${isReliable ? "✅ YES" : "❌ NO"}`);
    console.log(`  Minutes from start: ${minutesFromStart}'`);
    console.log(`  Status: ${match.status}`);

    if (!isReliable) {
      console.warn(`  ⚠️ Will show LIVE instead of minute!`);
    }
    console.log("---");
  });

  const reliableMatches = liveMatches.filter((m) => isBackendMinuteReliable(m));
  const unreliableMatches = liveMatches.filter(
    (m) => !isBackendMinuteReliable(m)
  );

  console.log(
    `✅ ${reliableMatches.length}/${liveMatches.length} matches have reliable minutes`
  );
  if (unreliableMatches.length > 0) {
    console.warn(
      `🚨 ${unreliableMatches.length} matches will show "LIVE" instead of minute`
    );
  }

  console.groupEnd();
}
