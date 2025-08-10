// src/utils/matchStatusUtils.js - POBOLJŠANA VERZIJA

/**
 * 🔧 POBOLJŠANO: Blaži filter za validne live utakmice
 * Umjesto 3 sata, koristimo 6 sati kao limit za zombie utakmice
 */
export function getValidLiveMatches(matches, zombieHourLimit = 6) {
  if (!matches || !Array.isArray(matches)) {
    return [];
  }

  const now = new Date();

  return matches.filter((match) => {
    // Provjeri da li je utakmica označena kao live/ht
    const isLiveStatus = ["live", "ht", "inprogress", "halftime"].includes(
      match.status?.toLowerCase()
    );

    if (!isLiveStatus) {
      return false;
    }

    // Provjeri da li je utakmica prekasno stara (zombie)
    if (match.start_time) {
      const startTime = new Date(match.start_time);
      const hoursElapsed = (now - startTime) / (1000 * 60 * 60);

      // 🔧 POBOLJŠANO: Blaži limit - 6 sati umjesto 3
      if (hoursElapsed > zombieHourLimit) {
        console.warn(
          `⚠️ Zombie match detected: ${match.home_team} vs ${
            match.away_team
          } (${hoursElapsed.toFixed(1)}h old)`
        );
        return false;
      }

      // Provjeri da li je utakmica u budućnosti (greška u statusu)
      if (hoursElapsed < -0.5) {
        // 30 minuta tolerance
        console.warn(
          `⚠️ Future match marked as live: ${match.home_team} vs ${match.away_team}`
        );
        return false;
      }
    }

    return true;
  });
}

/**
 * 🔧 NOVO: Alternativna funkcija koja ne filtrira ništa (za debugging)
 */
export function getAllLiveMatches(matches) {
  if (!matches || !Array.isArray(matches)) {
    return [];
  }

  return matches.filter((match) => {
    return ["live", "ht", "inprogress", "halftime"].includes(
      match.status?.toLowerCase()
    );
  });
}

/**
 * Pronađi problematične utakmice za debugging
 */
export function findProblemMatches(matches, strict = false) {
  if (!matches || !Array.isArray(matches)) {
    return [];
  }

  const now = new Date();
  const problems = [];

  matches.forEach((match) => {
    const isLive = ["live", "ht", "inprogress", "halftime"].includes(
      match.status?.toLowerCase()
    );

    if (!isLive) return;

    if (match.start_time) {
      const startTime = new Date(match.start_time);
      const hoursElapsed = (now - startTime) / (1000 * 60 * 60);

      // Različiti kriteriji za "problem"
      const isZombie = strict ? hoursElapsed > 3 : hoursElapsed > 6;
      const isFuture = hoursElapsed < -0.5;
      const hasInvalidMinute =
        match.minute && (match.minute > 120 || match.minute < 0);
      const isVeryOld = hoursElapsed > 12; // Definitivno problem

      if (isZombie || isFuture || hasInvalidMinute || isVeryOld) {
        problems.push({
          ...match,
          problemType: isVeryOld
            ? "very_old"
            : isZombie
            ? "zombie"
            : isFuture
            ? "future"
            : "invalid_minute",
          hoursElapsed: hoursElapsed.toFixed(1),
        });
      }
    }
  });

  return problems;
}

/**
 * 🔧 NOVO: Validacija statusa s boljom logikom
 */
export function validateLiveStatus(match) {
  if (!match || !match.status) {
    return "upcoming";
  }

  const status = match.status.toLowerCase();
  const now = new Date();

  // Ako nije označen kao live, vrati original status
  if (!["live", "ht", "inprogress", "halftime"].includes(status)) {
    return status;
  }

  // Provjeri vremensku logiku za live utakmice
  if (match.start_time) {
    const startTime = new Date(match.start_time);
    const hoursElapsed = (now - startTime) / (1000 * 60 * 60);

    // Ako je utakmica vrlo stara, vjerojatno je završena
    if (hoursElapsed > 6) {
      console.warn(
        `🚨 Status validation: Forcing old live match to finished (${hoursElapsed.toFixed(
          1
        )}h old)`
      );
      return "finished";
    }

    // Ako je utakmica u budućnosti, vjerojatno je upcoming
    if (hoursElapsed < -0.5) {
      console.warn(
        `🚨 Status validation: Forcing future live match to upcoming`
      );
      return "upcoming";
    }
  }

  // Inače vrati original status
  return status;
}

/**
 * 🔧 POBOLJŠANO: Kalkulacija minute s boljom logikom
 */
export function calculateDisplayMinute(match, currentTime = new Date()) {
  const validatedStatus = validateLiveStatus(match);

  // Samo za live utakmice
  if (!["live", "inprogress"].includes(validatedStatus)) {
    return null;
  }

  // Ako imamo backend minutu, koristi ju
  if (
    match.minute &&
    typeof match.minute === "number" &&
    match.minute > 0 &&
    match.minute <= 120
  ) {
    return `${match.minute}'`;
  }

  // Fallback na real-time kalkulaciju
  const realTimeMinute = calculateRealTimeMinute(match, currentTime);
  if (realTimeMinute && realTimeMinute > 0 && realTimeMinute <= 120) {
    return `${realTimeMinute}'`;
  }

  // Fallback na "LIVE"
  return "LIVE";
}

/**
 * Kalkulacija minute na temelju vremena početka
 */
export function calculateRealTimeMinute(match, currentTime = new Date()) {
  if (!match.start_time) {
    return null;
  }

  const startTime = new Date(match.start_time);
  const minutesElapsed = Math.floor((currentTime - startTime) / (1000 * 60));

  // Sigurnosne provjere
  if (minutesElapsed < 0) return 1;
  if (minutesElapsed > 150) return 90; // Cap na 90 za vrlo stare utakmice

  // Real-time kalkulacija
  if (minutesElapsed <= 45) {
    return Math.max(1, minutesElapsed);
  } else if (minutesElapsed <= 60) {
    // Poluvrijeme ili dodatno vrijeme prvog poluvremena
    return Math.min(45 + Math.max(0, minutesElapsed - 45), 50);
  } else if (minutesElapsed <= 105) {
    // Drugi poluvrijeme
    return Math.min(45 + (minutesElapsed - 60), 90);
  } else {
    // Produžeci
    return Math.min(90 + (minutesElapsed - 105), 120);
  }
}

/**
 * 🔧 NOVO: Quick stats za debugging
 */
export function getMatchesStats(matches) {
  if (!matches || !Array.isArray(matches)) {
    return { total: 0, live: 0, zombie: 0, valid: 0 };
  }

  const now = new Date();
  const stats = {
    total: matches.length,
    live: 0,
    zombie: 0,
    valid: 0,
    recent: 0,
    old: 0,
  };

  matches.forEach((match) => {
    const isLive = ["live", "ht", "inprogress", "halftime"].includes(
      match.status?.toLowerCase()
    );

    if (isLive) {
      stats.live++;

      if (match.start_time) {
        const startTime = new Date(match.start_time);
        const hoursElapsed = (now - startTime) / (1000 * 60 * 60);

        if (hoursElapsed > 6) {
          stats.zombie++;
        } else {
          stats.valid++;
        }

        if (hoursElapsed < 0.5) {
          stats.recent++;
        }

        if (hoursElapsed > 3) {
          stats.old++;
        }
      } else {
        stats.valid++; // Ako nema start_time, tretiramo kao valid
      }
    }
  });

  return stats;
}
