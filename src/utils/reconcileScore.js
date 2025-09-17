// src/utils/reconcileScore.js
// Provider-first score resolution (authoritative DB values sourced from provider homeScore.current / awayScore.current).
// Events are ONLY used as a fallback when provider scoreboard values are missing (null) AND we have parsed goal events.
// We still compute an event aggregate for diagnostics & mismatch flags.

const GOAL_EVENTS = new Set(["goal", "penalty_goal", "own_goal"]);

function aggregateFromEvents(rawEvents = []) {
  const dedupeSet = new Set();
  let duplicates = 0;
  let home = 0;
  let away = 0;
  for (const e of rawEvents) {
    if (!GOAL_EVENTS.has(e.event_type)) continue;
    const t =
      e.team === "home" || e.team === "away" ? e.team : e.team_side || e.team;
    const key = `${e.minute}|${e.player_name || ""}|${e.event_type}|${t}`;
    if (dedupeSet.has(key)) {
      duplicates++;
      continue;
    }
    dedupeSet.add(key);
    if (e.event_type === "own_goal") {
      if (t === "home") away++;
      else if (t === "away") home++;
    } else {
      if (t === "home") home++;
      else if (t === "away") away++;
    }
  }
  return { home, away, total: home + away, duplicates };
}

export function reconcileSingle(match, events) {
  const rawHome = match.home_score;
  const rawAway = match.away_score;
  const providerHas =
    rawHome !== null &&
    rawHome !== undefined &&
    rawAway !== null &&
    rawAway !== undefined;

  const breakdown = aggregateFromEvents(events);
  const { home: evHome, away: evAway, total: evTotal } = breakdown;
  const eventsHave = evTotal > 0;

  let displayHome = rawHome;
  let displayAway = rawAway;
  let source = "db_aligned"; // default optimistic label

  if (providerHas) {
    if (eventsHave && (evHome !== rawHome || evAway !== rawAway)) {
      source = "db_mismatch_events"; // provider trusted, events disagree
    } else if (!eventsHave) {
      source = "db_no_events";
    }
  } else {
    // Provider scoreboard missing → fallback to events if available
    if (eventsHave) {
      displayHome = evHome;
      displayAway = evAway;
      source = "events_fallback";
    } else {
      source = "db_missing_no_events";
    }
  }

  const scoreMismatch =
    providerHas && eventsHave && (evHome !== rawHome || evAway !== rawAway);

  // Dev diagnostic log (avoid optional chaining on import.meta for build compatibility)
  try {
    if (
      typeof console !== "undefined" &&
      typeof import.meta !== "undefined" &&
      import.meta.env &&
      import.meta.env.DEV
    ) {
      console.debug(
        `[reconcileScore] match=${match.id} status=${match.status} provider=${rawHome}-${rawAway} events=${evHome}-${evAway} src=${source}`
      );
    }
  } catch {}

  return {
    ...match,
    display_home_score: displayHome,
    display_away_score: displayAway,
    score_mismatch: scoreMismatch,
    score_source: source,
    event_goal_breakdown: breakdown,
    event_score_home: evHome,
    event_score_away: evAway,
  };
}

export function reconcileScoresArray(matches, eventRows) {
  const grouped = new Map();
  for (const ev of eventRows) {
    if (!grouped.has(ev.match_id)) grouped.set(ev.match_id, []);
    grouped.get(ev.match_id).push(ev);
  }
  return matches.map((m) => reconcileSingle(m, grouped.get(m.id) || []));
}
