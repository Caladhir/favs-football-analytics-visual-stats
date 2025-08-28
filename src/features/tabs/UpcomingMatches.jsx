import React, { useMemo, useState } from "react";
import useMatchesByDate from "../../hooks/useMatchesByDate";
import MatchesGrid from "../../ui/MatchesGrid";
import LoadingState from "../../ui/LoadingState";
import ErrorState from "../../ui/ErrorState";
import EmptyUpcoming from "../upcoming_matches/EmptyUpcomingMatches";
import UpcomingHeader from "../upcoming_matches/UpcomingMatchesHeader";
import { normalizeStatus } from "../../utils/matchStatusUtils";

/* --- helpers --- */
const EXCLUDE = new Set(["live", "ht", "finished", "ft"]);
const GRACE_MINUTES = 20;

function startOfDay(d) {
  const x = d instanceof Date ? new Date(d) : new Date(d || Date.now());
  x.setHours(0, 0, 0, 0);
  return x;
}

function isStrictUpcoming(match, selectedDate, now = new Date()) {
  const status = normalizeStatus(match.status || match.status_type);
  // sve što NIJE “upcoming” makni
  if (EXCLUDE.has(status)) return false;

  const start = new Date(match.start_time);
  if (!Number.isFinite(start.getTime())) return false;

  const daySel = startOfDay(selectedDate).getTime();
  const dayNow = startOfDay(now).getTime();
  const isToday = daySel === dayNow;

  if (isToday) {
    return start.getTime() >= now.getTime() - GRACE_MINUTES * 60 * 1000;
  }

  if (daySel > dayNow) return true;

  return false;
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

  const { matches, loading, backgroundRefreshing, error, refetch } =
    useMatchesByDate(selectedDate, { enabled: true });

  const sortedUpcoming = useMemo(() => {
    const now = new Date();

    const upcomingOnly = (matches || []).filter((m) =>
      isStrictUpcoming(m, selectedDate, now)
    );

    const deduped = dedupeByTeamsTime(upcomingOnly);

    deduped.sort(
      (a, b) =>
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    );

    if (import.meta.env.DEV) {
      console.log(
        `🔄 Upcoming filter: total=${matches?.length || 0} → upcoming=${
          upcomingOnly.length
        } → deduped=${deduped.length}`
      );
    }
    return deduped;
  }, [matches, selectedDate]);

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
