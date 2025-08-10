// src/utils/matchStatusUtils.js - KOMPLETAN FAJL

export function getValidLiveMatches(matches, zombieHourLimit = 10) {
  if (!matches || !Array.isArray(matches)) {
    return [];
  }

  const now = new Date();
  let filteredCount = 0;

  const valid = matches.filter((match) => {
    const isLiveStatus = ["live", "ht", "inprogress", "halftime"].includes(
      match.status?.toLowerCase()
    );

    if (!isLiveStatus) {
      return false;
    }

    if (match.start_time) {
      const startTime = new Date(match.start_time);
      const hoursElapsed = (now - startTime) / (1000 * 60 * 60);

      if (hoursElapsed > zombieHourLimit) {
        console.warn(
          `⚠️ Very old match filtered: ${match.home_team} vs ${
            match.away_team
          } (${hoursElapsed.toFixed(1)}h old)`
        );
        filteredCount++;
        return false;
      }

      if (hoursElapsed < -2) {
        console.warn(
          `⚠️ Future match filtered: ${match.home_team} vs ${match.away_team}`
        );
        filteredCount++;
        return false;
      }
    }

    return true;
  });

  if (import.meta.env.DEV) {
    console.log(
      `🔍 Live filter (${zombieHourLimit}h limit): ${matches.length} raw → ${valid.length} valid (filtered: ${filteredCount})`
    );
  }

  return valid;
}

export function getAllLiveMatches(matches) {
  if (!matches || !Array.isArray(matches)) {
    return [];
  }

  const liveMatches = matches.filter((match) => {
    return ["live", "ht", "inprogress", "halftime"].includes(
      match.status?.toLowerCase()
    );
  });

  if (import.meta.env.DEV) {
    console.log(
      `🔍 All live matches (no filter): ${matches.length} total → ${liveMatches.length} live`
    );
  }

  return liveMatches;
}

export function getValidLiveMatchesRelaxed(matches) {
  if (!matches || !Array.isArray(matches)) {
    return [];
  }

  const now = new Date();
  let filteredCount = 0;

  const valid = matches.filter((match) => {
    const isLiveStatus = ["live", "ht", "inprogress", "halftime"].includes(
      match.status?.toLowerCase()
    );

    if (!isLiveStatus) {
      return false;
    }

    if (match.start_time) {
      const startTime = new Date(match.start_time);
      const hoursElapsed = (now - startTime) / (1000 * 60 * 60);

      if (hoursElapsed > 24) {
        console.warn(
          `⚠️ Dead match filtered: ${match.home_team} vs ${
            match.away_team
          } (${hoursElapsed.toFixed(1)}h old)`
        );
        filteredCount++;
        return false;
      }

      if (hoursElapsed < -4) {
        console.warn(
          `⚠️ Future match filtered: ${match.home_team} vs ${match.away_team}`
        );
        filteredCount++;
        return false;
      }
    }

    return true;
  });

  if (import.meta.env.DEV) {
    console.log(
      `🔍 Relaxed live filter: ${matches.length} raw → ${valid.length} valid (filtered: ${filteredCount})`
    );
  }

  return valid;
}

export function getLiveMatchesForTab(matches) {
  if (!matches || !Array.isArray(matches)) {
    return [];
  }

  const now = new Date();

  const liveMatches = matches.filter((match) => {
    const isLiveStatus = ["live", "ht", "inprogress", "halftime"].includes(
      match.status?.toLowerCase()
    );

    if (!isLiveStatus) return false;

    if (match.start_time) {
      const startTime = new Date(match.start_time);
      const hoursElapsed = (now - startTime) / (1000 * 60 * 60);

      if (hoursElapsed > 48) {
        return false;
      }
    }

    return true;
  });

  if (import.meta.env.DEV) {
    console.log(
      `🔍 Live matches for tab: ${matches.length} total → ${liveMatches.length} live (ultra-relaxed filter)`
    );
  }

  return liveMatches;
}

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

      const isZombie = strict ? hoursElapsed > 3 : hoursElapsed > 10;
      const isFuture = hoursElapsed < -0.5;
      const hasInvalidMinute =
        match.minute && (match.minute > 120 || match.minute < 0);
      const isVeryOld = hoursElapsed > 12;

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

export function validateLiveStatus(match) {
  if (!match || !match.status) {
    return "upcoming";
  }

  const status = match.status.toLowerCase();
  const now = new Date();

  if (!["live", "ht", "inprogress", "halftime"].includes(status)) {
    return status;
  }

  if (match.start_time) {
    const startTime = new Date(match.start_time);
    const hoursElapsed = (now - startTime) / (1000 * 60 * 60);

    if (hoursElapsed > 10) {
      console.warn(
        `🚨 Status validation: Forcing old live match to finished (${hoursElapsed.toFixed(
          1
        )}h old)`
      );
      return "finished";
    }

    if (hoursElapsed < -1) {
      console.warn(
        `🚨 Status validation: Forcing future live match to upcoming`
      );
      return "upcoming";
    }
  }

  return status;
}

export function calculateDisplayMinute(match, currentTime = new Date()) {
  const validatedStatus = validateLiveStatus(match);

  if (!["live", "inprogress"].includes(validatedStatus)) {
    return null;
  }

  if (
    match.minute &&
    typeof match.minute === "number" &&
    match.minute > 0 &&
    match.minute <= 120
  ) {
    return `${match.minute}'`;
  }

  const realTimeMinute = calculateRealTimeMinute(match, currentTime);
  if (realTimeMinute && realTimeMinute > 0 && realTimeMinute <= 120) {
    return `${realTimeMinute}'`;
  }

  return "LIVE";
}

export function calculateRealTimeMinute(match, currentTime = new Date()) {
  if (!match.start_time) {
    return null;
  }

  const startTime = new Date(match.start_time);
  const minutesElapsed = Math.floor((currentTime - startTime) / (1000 * 60));

  if (minutesElapsed < 0) return 1;
  if (minutesElapsed > 150) return 90;

  if (minutesElapsed <= 45) {
    return Math.max(1, minutesElapsed);
  } else if (minutesElapsed <= 60) {
    // Poluvrijeme
    return Math.min(45 + Math.max(0, minutesElapsed - 45), 50);
  } else if (minutesElapsed <= 105) {
    // Drugi poluvrijeme
    return Math.min(45 + (minutesElapsed - 60), 90);
  } else {
    // Produžeci
    return Math.min(90 + (minutesElapsed - 105), 120);
  }
}

/*
 Quick stats za debugging
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

        if (hoursElapsed > 10) {
          stats.zombie++;
        } else {
          stats.valid++;
        }

        if (hoursElapsed < 0.5) {
          stats.recent++;
        }

        if (hoursElapsed > 6) {
          stats.old++;
        }
      } else {
        stats.valid++;
      }
    }
  });

  return stats;
}
