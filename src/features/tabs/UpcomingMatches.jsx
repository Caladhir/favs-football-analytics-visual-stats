import React, { useMemo, useState, useEffect } from "react";
import useMatchesByDate from "../../hooks/useMatchesByDate";
import MatchesGrid from "../../ui/MatchesGrid";
import LoadingState from "../../ui/LoadingState";
import ErrorState from "../../ui/ErrorState";
import EmptyUpcoming from "../upcoming_matches/EmptyUpcomingMatches";
import UpcomingHeader from "../upcoming_matches/UpcomingMatchesHeader";
import {
  normalizeStatus,
  validateLiveStatus,
} from "../../utils/matchStatusUtils";

/* --- helpers --- */
// Exclude all live/halftime and finished variants explicitly; anything we consider 'in progress'
const EXCLUDE = new Set([
  "live",
  "ht",
  "inprogress",
  "in_progress",
  "halftime",
  "1h",
  "2h",
  "finished",
  "ft",
  "full_time",
]);
// Grace window: allow a small negative offset if system clock / provider drift (<2m) – previously 20m which let early-live linger.
const GRACE_MINUTES = 2;

function startOfDay(d) {
  const x = d instanceof Date ? new Date(d) : new Date(d || Date.now());
  x.setHours(0, 0, 0, 0);
  return x;
}

function isStrictUpcoming(match, selectedDate, now = new Date()) {
  // If bridge logic already considers it live/ht, exclude immediately.
  const bridged = validateLiveStatus(match);
  if (bridged === "live" || bridged === "ht") return false;

  const status = normalizeStatus(match.status || match.status_type);
  if (EXCLUDE.has(status)) return false;

  const start = new Date(match.start_time);
  if (!Number.isFinite(start.getTime())) return false;

  const daySel = startOfDay(selectedDate).getTime();
  const dayNow = startOfDay(now).getTime();
  const isToday = daySel === dayNow;

  if (isToday) {
    // Exclude if kickoff passed more than -GRACE_MINUTES (i.e. real-time minute badge should appear in live tab)
    const diffMs = start.getTime() - now.getTime(); // positive => future
    if (diffMs < -GRACE_MINUTES * 60 * 1000) return false; // already started
    return true;
  }
  if (daySel > dayNow) return true; // future day
  return false; // past day
}

function dedupeByTeamsTime(list = []) {
  const keyOf = (m) => {
    const t = Math.round(new Date(m.start_time).getTime() / 60000);
    const home = (m.home_team || "").toLowerCase().trim();
    const away = (m.away_team || "").toLowerCase().trim();
    return `${home}::${away}::${t}`;
  };
  const seen = new Map();
  for (const m of list) {
    const k = keyOf(m);
    const prev = seen.get(k);
    if (!prev) {
      seen.set(k, m);
      continue;
    }
    const prefer =
      (m.source === "sofascore") - (prev.source === "sofascore") ||
      new Date(m.updated_at).getTime() - new Date(prev.updated_at).getTime();
    if (prefer > 0) seen.set(k, m);
  }
  return [...seen.values()];
}

export default function UpcomingMatches() {
  const [selectedDate, setSelectedDate] = useState(() =>
    startOfDay(new Date())
  );
  const today = startOfDay(new Date());

  // Tick every 20s to auto-recompute without manual refresh so items leave Upcoming promptly
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 20000);
    return () => clearInterval(id);
  }, []);

  const { matches, loading, backgroundRefreshing, error, refetch } =
    useMatchesByDate(selectedDate, { enabled: true });

  const sortedUpcoming = useMemo(() => {
    const now = new Date();

    let excludedLive = 0;
    const upcomingOnly = (matches || []).filter((m) => {
      const keep = isStrictUpcoming(m, selectedDate, now);
      if (!keep) {
        const st = normalizeStatus(m.status || m.status_type);
        if (EXCLUDE.has(st)) excludedLive += 1;
      }
      return keep;
    });

    const deduped = dedupeByTeamsTime(upcomingOnly);

    deduped.sort(
      (a, b) =>
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    );

    if (import.meta.env.DEV) {
      console.log(
        `🔄 Upcoming filter: total=${matches?.length || 0} → upcoming=${
          upcomingOnly.length
        } → deduped=${deduped.length} (excluded_live=${excludedLive})`
      );
    }
    // Attach debug meta (dev only)
    deduped._excludedLive = excludedLive; // harmless property for optional badge
    return deduped;
  }, [matches, selectedDate, tick]);

  if (loading) return <LoadingState message="Loading upcoming matches..." />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  if (!sortedUpcoming.length) {
    return (
      <EmptyUpcoming
        selectedDate={selectedDate}
        setSelectedDate={setSelectedDate}
        timeFilter="selected"
        priorityFilter="all"
        onRefresh={refetch}
      />
    );
  }

  const canGoPrev = selectedDate.getTime() > today.getTime();

  return (
    <div className="min-h-screen  rounded-3xl p-1">
      <UpcomingHeader
        selectedDate={selectedDate}
        setSelectedDate={setSelectedDate}
        count={sortedUpcoming.length}
        backgroundRefreshing={backgroundRefreshing}
      />

      {import.meta.env.DEV && sortedUpcoming._excludedLive > 0 && (
        <div className="flex justify-center mb-4">
          <div className="px-4 py-1 rounded-full text-xs bg-yellow-500/20 text-yellow-300 border border-yellow-500/30">
            Filtered out {sortedUpcoming._excludedLive} live/ht matches from
            this date
          </div>
        </div>
      )}

      <MatchesGrid
        groupByCompetition={true}
        groupedMatches={null}
        sortedMatches={sortedUpcoming}
        showLiveIndicator={false}
      />

      <div className="flex justify-center items-center gap-3 mt-8 mb-4">
        <button
          onClick={refetch}
          disabled={backgroundRefreshing}
          className={`px-6 py-3 rounded-xl font-medium transition-all duration-200 flex items-center gap-2 ${
            backgroundRefreshing
              ? "bg-gray-600 text-gray-300 cursor-not-allowed"
              : "bg-blue-600 text-white hover:bg-blue-700 hover:scale-105 active:scale-95"
          }`}
        >
          <span className={`${backgroundRefreshing ? "animate-spin" : ""}`}>
            🔄
          </span>
          {backgroundRefreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>
    </div>
  );
}
