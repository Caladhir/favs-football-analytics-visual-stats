// src/utils/matchFilterUtils.js - CENTRALIZED MATCH FILTERING LOGIC

/**
 * Check if match is finished
 */
export function isMatchFinished(match, currentTime = new Date()) {
  const status = match.status?.toLowerCase()?.trim() || "";

  // Eksplicitno završeni statusi
  const finishedStatuses = [
    "finished",
    "ft",
    "full_time",
    "ended",
    "final",
    "afterextra",
    "penalties",
    "penalty_shootout",
    "fulltime",
    "match_finished",
  ];

  if (finishedStatuses.includes(status)) {
    return true;
  }

  // Zombie detection - live/ht utakmice koje traju predugo
  const zombieStatuses = ["live", "ht", "inprogress", "halftime", "inplay"];
  if (zombieStatuses.includes(status)) {
    try {
      const matchStart = new Date(match.start_time);
      const hoursElapsed = (currentTime - matchStart) / (1000 * 60 * 60);

      // Ako je prošlo više od 3 sata, tretiramo kao finished
      if (hoursElapsed > 3) {
        if (import.meta.env.DEV) {
          console.warn(
            `🧟 Zombie match detected: ${match.home_team} vs ${
              match.away_team
            } (${hoursElapsed.toFixed(1)}h ago)`
          );
        }
        return true;
      }
    } catch (error) {
      console.warn("Error calculating match duration:", error);
    }
  }

  return false;
}

/**
 * Check if match is upcoming
 */
export function isMatchUpcoming(match, currentTime = new Date()) {
  const status = match.status?.toLowerCase()?.trim() || "";

  // Eksplicitno upcoming statusi
  const upcomingStatuses = [
    "upcoming",
    "notstarted",
    "scheduled",
    "not_started",
    "ns",
    "fixture",
    "tbd",
    "to_be_determined",
  ];

  if (upcomingStatuses.includes(status)) {
    return true;
  }

  // Također provjeri da li je match u budućnosti
  try {
    const matchStart = new Date(match.start_time);
    const minutesUntilStart = (matchStart - currentTime) / (1000 * 60);

    // Ako je match za više od 10 minuta i status nije finished/live, tretiramo kao upcoming
    if (
      minutesUntilStart > 10 &&
      !["finished", "ft", "live", "ht", "inprogress", "halftime"].includes(
        status
      )
    ) {
      return true;
    }
  } catch (error) {
    console.warn("Error calculating match start time:", error);
  }

  return false;
}

/**
 * Check if match is live
 */
export function isMatchLive(match) {
  const status = match.status?.toLowerCase()?.trim() || "";
  const liveStatuses = ["live", "ht", "inprogress", "halftime", "inplay"];

  if (!liveStatuses.includes(status)) {
    return false;
  }

  // Additional check for zombie matches
  try {
    const matchStart = new Date(match.start_time);
    const hoursElapsed = (new Date() - matchStart) / (1000 * 60 * 60);

    // Ako je prošlo više od 3 sata, nije više live
    if (hoursElapsed > 3) {
      return false;
    }
  } catch (error) {
    console.warn("Error calculating match duration:", error);
  }

  return true;
}

/**
 * Check if match is on specific date
 */
export function isMatchOnDate(match, targetDate) {
  try {
    const matchDate = new Date(match.start_time);
    const target = new Date(targetDate);

    // Postaviti oba datuma na početak dana
    matchDate.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);

    return matchDate.getTime() === target.getTime();
  } catch (error) {
    console.warn("Error comparing dates:", error);
    return false;
  }
}

/**
 * Check if match is in time range
 */
export function isMatchInTimeRange(
  match,
  timeFilter,
  referenceDate = new Date()
) {
  try {
    const matchStart = new Date(match.start_time);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    const weekStart = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const selectedDay = new Date(referenceDate);
    selectedDay.setHours(0, 0, 0, 0);
    const selectedDayEnd = new Date(
      selectedDay.getTime() + 24 * 60 * 60 * 1000
    );

    switch (timeFilter) {
      case "selected":
        return matchStart >= selectedDay && matchStart < selectedDayEnd;
      case "today":
        return matchStart >= today && matchStart < tomorrow;
      case "yesterday":
        return matchStart >= yesterday && matchStart < today;
      case "tomorrow":
        return (
          matchStart >= tomorrow &&
          matchStart < new Date(tomorrow.getTime() + 24 * 60 * 60 * 1000)
        );
      case "week":
        return matchStart >= weekStart && matchStart <= today; // Past week
      case "nextWeek":
      case "thisWeek":
        return matchStart >= today && matchStart <= nextWeek; // Next week
      case "next24h":
        const next24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        return matchStart >= now && matchStart <= next24h;
      case "all":
      default:
        return true;
    }
  } catch (error) {
    console.warn("Error filtering by time range:", error);
    return false;
  }
}

/**
 * Filter matches by result type
 */
export function filterMatchesByResult(matches, resultFilter) {
  if (!matches || !matches.length || resultFilter === "all") {
    return matches;
  }

  return matches.filter((match) => {
    const homeScore = match.home_score ?? 0;
    const awayScore = match.away_score ?? 0;
    const totalGoals = homeScore + awayScore;

    switch (resultFilter) {
      case "withGoals":
        return totalGoals > 0;
      case "draws":
        return homeScore === awayScore;
      case "highScoring":
        return totalGoals >= 3;
      case "lowScoring":
        return totalGoals <= 1;
      case "homeWins":
        return homeScore > awayScore;
      case "awayWins":
        return awayScore > homeScore;
      default:
        return true;
    }
  });
}

/**
 * Remove duplicate matches
 */
export function removeDuplicateMatches(matches) {
  const seen = new Map();
  const deduped = [];

  for (const match of matches) {
    const key = [
      match.id,
      match.home_team?.toLowerCase()?.trim(),
      match.away_team?.toLowerCase()?.trim(),
      match.start_time,
      match.competition?.toLowerCase()?.trim(),
    ]
      .filter(Boolean)
      .join("|");

    if (!seen.has(key)) {
      seen.set(key, match);
      deduped.push(match);
    } else {
      // Zadržaj noviji update
      const existing = seen.get(key);
      const existingUpdate = new Date(existing.updated_at || 0);
      const currentUpdate = new Date(match.updated_at || 0);

      if (currentUpdate > existingUpdate) {
        const index = deduped.findIndex((m) => seen.get(key) === m);
        if (index !== -1) {
          deduped[index] = match;
          seen.set(key, match);
        }
      }
    }
  }

  const duplicatesRemoved = matches.length - deduped.length;
  if (duplicatesRemoved > 0 && import.meta.env.DEV) {
    console.log(`🔧 Removed ${duplicatesRemoved} duplicate matches`);
  }

  return deduped;
}

/**
 * Categorize matches by status
 */
export function categorizeMatches(matches, currentTime = new Date()) {
  if (!matches || !matches.length) {
    return {
      live: [],
      upcoming: [],
      finished: [],
      unknown: [],
    };
  }

  const categories = {
    live: [],
    upcoming: [],
    finished: [],
    unknown: [],
  };

  for (const match of matches) {
    if (isMatchLive(match)) {
      categories.live.push(match);
    } else if (isMatchUpcoming(match, currentTime)) {
      categories.upcoming.push(match);
    } else if (isMatchFinished(match, currentTime)) {
      categories.finished.push(match);
    } else {
      categories.unknown.push(match);
    }
  }

  return categories;
}

/**
 * Get matches starting soon (next 2 hours)
 */
export function getImminentMatches(matches, hoursThreshold = 2) {
  const now = new Date();
  const threshold = new Date(now.getTime() + hoursThreshold * 60 * 60 * 1000);

  return matches.filter((match) => {
    if (!isMatchUpcoming(match)) return false;

    try {
      const matchStart = new Date(match.start_time);
      return matchStart >= now && matchStart <= threshold;
    } catch (error) {
      return false;
    }
  });
}
