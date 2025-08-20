// src/features/tabs/AllMatches.jsx - AŽURIRANO S NOVIM BUTTON KOMPONENTAMA
import React, { useState, useMemo } from "react";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";
import { useAllMatches } from "../../hooks/useAllMatches";

import {
  sortMatches,
  groupMatchesByCompetition,
  useUserPreferences,
  getLeaguePriority,
  isUserFavorite,
} from "../../utils/matchSortingUtils";
import {
  getValidLiveMatches,
  normalizeStatus,
} from "../../utils/matchStatusUtils";

// UI Components
import AllMatchesHeader from "../../features/all_matches/AllMatchesHeader";
import MatchesGrid from "../../ui/MatchesGrid";
import AllMatchesDebug from "../../features/all_matches/AllMatchesDebug";
import EmptyAllMatches from "../../features/all_matches/EmptyAllMatches";
import LoadingState from "../../ui/LoadingState";
import ErrorState from "../../ui/ErrorState";

// Import novih button komponenti
import TimeSortButton, { applyTimeSort } from "../../ui/TimeSortButton";
import GroupButton from "../../ui/GroupButton";
import { RefreshButton, PillButton } from "../../ui/SpecializedButtons";

/* ---------------------------------------------
   DEDUPE: spajaj duplikate (live + scheduled)
   ključ = (home, away, start_time[min], competition)
   preferiraj: bolji status > noviji updated_at > source=sofascore
--------------------------------------------- */

const STATUS_RANK = {
  live: 4,
  inprogress: 4,
  ht: 3,
  halftime: 3,
  finished: 2,
  ft: 2,
  full_time: 2,
  afterextra: 2,
  aet: 2,
  penalties: 2,
  postponed: 1,
  canceled: 1,
  cancelled: 1,
  upcoming: 0,
  scheduled: 0,
  notstarted: 0,
  not_started: 0,
  ns: 0,
};

function rankStatus(s) {
  return STATUS_RANK[(s || "").toString().toLowerCase()] ?? 0;
}

function minuteKey(iso) {
  const t = new Date(iso);
  if (!Number.isFinite(t.getTime())) return "0";
  return String(Math.round(t.getTime() / 60000)); // round to minute
}

function safeLower(s) {
  return (s || "").toString().toLowerCase().trim();
}

function makeKey(m) {
  return [
    safeLower(m.home_team),
    safeLower(m.away_team),
    minuteKey(m.start_time),
    safeLower(m.competition),
  ].join("|");
}

function chooseBetter(a, b) {
  // 1) bolji status
  const rsA = rankStatus(a.status || a.status_type);
  const rsB = rankStatus(b.status || b.status_type);
  if (rsB > rsA) return b;
  if (rsA > rsB) return a;

  // 2) noviji updated_at
  const ua = new Date(a.updated_at || a.last_seen_at || 0).getTime();
  const ub = new Date(b.updated_at || b.last_seen_at || 0).getTime();
  if (ub > ua) return b;
  if (ua > ub) return a;

  // 3) preferiraj sofascore
  const sa = (a.source || "").toLowerCase();
  const sb = (b.source || "").toLowerCase();
  if (sb === "sofascore" && sa !== "sofascore") return b;
  if (sa === "sofascore" && sb !== "sofascore") return a;

  // 4) fallback: ostavi a
  return a;
}

function dedupeByTeamsTime(list = []) {
  const seen = new Map();
  for (const m of list) {
    const k = makeKey(m);
    const prev = seen.get(k);
    if (!prev) {
      seen.set(k, m);
      continue;
    }
    seen.set(k, chooseBetter(prev, m));
  }
  const deduped = Array.from(seen.values());
  if (import.meta.env.DEV && list.length !== deduped.length) {
    console.log(
      `🔧 AllMatches dedupe: ${list.length} → ${deduped.length} (-${
        list.length - deduped.length
      })`
    );
  }
  return deduped;
}

/* --------------------------------------------- */

export default function AllMatches() {
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const [groupByCompetition, setGroupByCompetition] = useState(false);
  const [timeSortType, setTimeSortType] = useState("smart"); // "smart" | "chronological" | "reverse-chronological"

  const userPreferences = useUserPreferences();
  const { matches, loading, backgroundRefreshing, handleAutoRefresh, error } =
    useAllMatches(selectedDate);

  // 1) DEDUPE
  const dedupedMatches = useMemo(
    () => dedupeByTeamsTime(matches || []),
    [matches]
  );

  // 2) SMART SORT + optional time sort
  const sortedMatches = useMemo(() => {
    if (!dedupedMatches.length) return [];

    const smartSorted = sortMatches(dedupedMatches, {
      prioritizeUserFavorites: userPreferences.sortingEnabled,
      favoriteTeams: userPreferences.favoriteTeams,
      favoriteLeagues: userPreferences.favoriteLeagues,
      currentTime: new Date(),
      debugMode: import.meta.env.DEV,
    });

    return applyTimeSort(smartSorted, timeSortType);
  }, [dedupedMatches, userPreferences, timeSortType]);

  // 3) Optional group by competition
  const groupedMatches = useMemo(() => {
    if (!groupByCompetition || !sortedMatches.length) return null;
    return groupMatchesByCompetition(sortedMatches);
  }, [sortedMatches, groupByCompetition]);

  // 4) Stats (nakon dedupe + sort)
  const stats = useMemo(() => {
    if (!sortedMatches.length) return null;

    const liveMatches = getValidLiveMatches(sortedMatches);
    const upcomingMatches = sortedMatches.filter((m) => {
      const s = normalizeStatus(m.status || m.status_type);
      return [
        "upcoming",
        "scheduled",
        "notstarted",
        "not_started",
        "ns",
      ].includes(s);
    });
    const finishedMatches = sortedMatches.filter((m) => {
      const s = normalizeStatus(m.status || m.status_type);
      return [
        "finished",
        "ft",
        "full_time",
        "afterextra",
        "aet",
        "penalties",
      ].includes(s);
    });
    const topLeaguesCount = sortedMatches.filter(
      (m) => getLeaguePriority(m.competition) > 80
    ).length;
    const favoritesCount = sortedMatches.filter((m) =>
      isUserFavorite(
        m,
        userPreferences.favoriteTeams,
        userPreferences.favoriteLeagues
      )
    ).length;

    return {
      total: sortedMatches.length,
      live: liveMatches.length,
      upcoming: upcomingMatches.length,
      finished: finishedMatches.length,
      topLeagues: topLeaguesCount,
      favorites: favoritesCount,
    };
  }, [sortedMatches, userPreferences]);

  // Auto-refresh kad ima live utakmica
  useAutoRefresh(dedupedMatches, handleAutoRefresh, 30000);

  if (loading) {
    return (
      <div className="min-h-screen bg-muted rounded-3xl p-1">
        <div className="flex justify-center my-4">
          <div className="bg-red-600 text-white px-4 py-2 rounded-full text-sm font-medium">
            📅 All Matches
          </div>
        </div>
        <LoadingState />
      </div>
    );
  }

  if (error) return <ErrorState error={error} onRetry={handleAutoRefresh} />;

  if (!dedupedMatches.length) {
    return (
      <EmptyAllMatches
        selectedDate={selectedDate}
        setSelectedDate={setSelectedDate}
        onRefresh={handleAutoRefresh}
      />
    );
  }

  return (
    <div className="min-h-screen bg-muted rounded-3xl p-1">
      <AllMatchesHeader
        selectedDate={selectedDate}
        setSelectedDate={setSelectedDate}
      />

      {/* Controls row - AŽURIRANO S NOVIM BUTTON KOMPONENTAMA */}
      <div className="text-center mb-4 space-y-3">
        {stats && (
          <div className="flex justify-center items-center gap-3 flex-wrap text-xs">
            {/* Status Pills - koristi PillButton */}
            {stats.live > 0 && (
              <PillButton active className="bg-red-600">
                🔴 {stats.live} Live
              </PillButton>
            )}
            {stats.upcoming > 0 && (
              <PillButton active className="bg-blue-600">
                ⏰ {stats.upcoming} Upcoming
              </PillButton>
            )}
            {stats.finished > 0 && (
              <PillButton active className="bg-green-600">
                ✅ {stats.finished} Finished
              </PillButton>
            )}
            {stats.topLeagues > 0 && (
              <PillButton active className="bg-yellow-600">
                ⭐ {stats.topLeagues} Top
              </PillButton>
            )}
            {stats.favorites > 0 && (
              <PillButton active className="bg-purple-600">
                ❤️ {stats.favorites} Favorites
              </PillButton>
            )}
          </div>
        )}

        {/* Controls Row */}
        <div className="flex justify-center items-center gap-4">
          {/* Group toggle - koristi GroupButton */}
          <GroupButton
            isGrouped={groupByCompetition}
            onToggle={() => setGroupByCompetition((v) => !v)}
            size="sm"
            variant="minimal"
            groupedText="📋 Grouped"
            ungroupedText="📝 Group"
          />

          {/* Time sort - već koristi TimeSortButton */}
          <TimeSortButton
            value={timeSortType}
            onChange={setTimeSortType}
            size="sm"
            variant="minimal"
          />
        </div>

        {/* Sort indicator */}
        {timeSortType !== "smart" && (
          <div className="text-xs text-muted-foreground">
            Sorted by:{" "}
            {timeSortType === "chronological"
              ? "Earliest first"
              : "Latest first"}
          </div>
        )}
      </div>

      <MatchesGrid
        groupByCompetition={groupByCompetition}
        groupedMatches={groupedMatches}
        sortedMatches={sortedMatches}
        showLiveIndicator={true}
      />

      {/* Refresh controls - AŽURIRANO */}
      <div className="flex justify-center items-center gap-3 mt-8 mb-4">
        <RefreshButton
          isLoading={backgroundRefreshing}
          onClick={handleAutoRefresh}
          size="lg"
        >
          {backgroundRefreshing ? "Refreshing..." : "Manual Refresh"}
        </RefreshButton>

        {/* Quick time-sort cycle (mobile) */}
        <button
          onClick={() => {
            const next =
              timeSortType === "smart"
                ? "chronological"
                : timeSortType === "chronological"
                ? "reverse-chronological"
                : "smart";
            setTimeSortType(next);
          }}
          className="md:hidden px-4 py-2 bg-gray-800/80 text-white rounded-lg border border-gray-600 hover:bg-gray-700/80 transition-colors"
          title="Cycle sort type"
        >
          {timeSortType === "smart"
            ? "🤖"
            : timeSortType === "chronological"
            ? "⏰↑"
            : "⏰↓"}
        </button>
      </div>

      <AllMatchesDebug
        matches={matches}
        sortedMatches={sortedMatches}
        userPreferences={userPreferences}
        backgroundRefreshing={backgroundRefreshing}
        stats={stats}
      />
    </div>
  );
}
