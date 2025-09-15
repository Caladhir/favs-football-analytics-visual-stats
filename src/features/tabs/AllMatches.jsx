// src/features/tabs/AllMatches.jsx - POPRAVLJENA STRUKTURA (kao UpcomingMatches)
import React, { useState, useMemo, useEffect } from "react";
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
import { compareFilters } from "../../utils/liveMatchFilters";
import EmptyAllMatches from "../../features/all_matches/EmptyAllMatches";
import ErrorState from "../../ui/ErrorState";

// Import button components
import TimeSortButton, { applyTimeSort } from "../../ui/TimeSortButton";
import GroupButton from "../../ui/GroupButton";
import { RefreshButton } from "../../ui/SpecializedButtons";

/* Dedupe logic - isti kao prije */
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
  return String(Math.round(t.getTime() / 60000));
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
  const rsA = rankStatus(a.status || a.status_type);
  const rsB = rankStatus(b.status || b.status_type);
  if (rsB > rsA) return b;
  if (rsA > rsB) return a;

  // Score-aware selection when status rank equal
  const ua = new Date(a.updated_at || a.last_seen_at || 0).getTime();
  const ub = new Date(b.updated_at || b.last_seen_at || 0).getTime();

  // Prefer record with non-null scores if other has nulls
  const aScoreOk = a.home_score !== null && a.away_score !== null;
  const bScoreOk = b.home_score !== null && b.away_score !== null;
  if (aScoreOk && !bScoreOk) return a;
  if (bScoreOk && !aScoreOk) return b;

  // If both have scores and differ, prefer the fresher updated_at; if timestamps equal, prefer higher total (likely newer)
  if (aScoreOk && bScoreOk && (a.home_score !== b.home_score || a.away_score !== b.away_score)) {
    if (ub > ua) return b;
    if (ua > ub) return a;
    const aTot = (a.home_score || 0) + (a.away_score || 0);
    const bTot = (b.home_score || 0) + (b.away_score || 0);
    if (bTot > aTot) return b;
    if (aTot > bTot) return a;
  }

  // Fall back to most recently updated
  if (ub > ua) return b;
  if (ua > ub) return a;

  const sa = (a.source || "").toLowerCase();
  const sb = (b.source || "").toLowerCase();
  if (sb === "sofascore" && sa !== "sofascore") return b;
  if (sa === "sofascore" && sb !== "sofascore") return a;

  if (import.meta.env.DEV) {
    if (aScoreOk && bScoreOk && (a.home_score !== b.home_score || a.away_score !== b.away_score)) {
      console.warn("⚠️ Score discrepancy unresolved (same freshness)", {
        a: { hs: a.home_score, as: a.away_score, updated_at: a.updated_at, source: a.source },
        b: { hs: b.home_score, as: b.away_score, updated_at: b.updated_at, source: b.source },
      });
    }
  }

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

export default function AllMatches() {
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const [groupByCompetition, setGroupByCompetition] = useState(false);
  const [timeSortType, setTimeSortType] = useState("smart");

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

  // DEV: Diagnose missing live matches between strict/relaxed filters
  useEffect(() => {
    if (!import.meta.env.DEV || !sortedMatches.length) return;
    try {
      const { strict, relaxed, all } = compareFilters(sortedMatches);
      const missing = all.filter(
        (m) => !strict.find((s) => s.id === m.id) && relaxed.find((r) => r.id === m.id)
      );
      if (missing.length) {
        console.group("🔎 Potentially filtered live matches (stale/age)");
        missing.slice(0, 20).forEach((m) => {
          console.log(
            `${m.home_team} vs ${m.away_team} status=${m.status} updated_at=${m.updated_at} start_time=${m.start_time}`
          );
        });
        console.groupEnd();
      }
    } catch (e) {
      console.warn("Live filter diagnostics failed", e);
    }
  }, [sortedMatches]);

  // 3) Optional group by competition
  const groupedMatches = useMemo(() => {
    if (!groupByCompetition || !sortedMatches.length) return null;
    return groupMatchesByCompetition(sortedMatches);
  }, [sortedMatches, groupByCompetition]);

  // 4) Stats
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

  // Auto-refresh
  useAutoRefresh(dedupedMatches, handleAutoRefresh, 30000);

  if (loading) {
    return (
      <div className="relative min-h-[600px]">
        <div className="flex justify-center items-center min-h-[400px]">
          <div className="text-center">
            <div className="relative mb-6">
              <div className="animate-spin w-16 h-16 border-4 border-red-500/30 border-t-red-500 rounded-full mx-auto"></div>
              <div className="absolute inset-0 animate-ping w-16 h-16 border-4 border-red-500/20 rounded-full mx-auto opacity-20"></div>
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">
              Loading All Matches
            </h3>
            <p className="text-gray-300">Fetching latest match data...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <ErrorState
        title="Failed to load matches"
        error={error}
        onRetry={handleAutoRefresh}
      />
    );
  }

  if (!dedupedMatches.length) {
    return (
      <EmptyAllMatches
        selectedDate={selectedDate}
        setSelectedDate={setSelectedDate}
        onRefresh={handleAutoRefresh}
      />
    );
  }

  // 🔧 KLJUČNO: Jednostavna struktura kao UpcomingMatches - BEZ složenih animation wrapper-a
  return (
    <div className="min-h-screen  rounded-3xl p-1">
      {/* Header - direktno bez animation wrapper-a */}
      <AllMatchesHeader
        selectedDate={selectedDate}
        setSelectedDate={setSelectedDate}
        matchCount={sortedMatches.length}
        backgroundRefreshing={backgroundRefreshing}
        stats={stats}
      />

      {/* Enhanced Controls - direktno bez animation wrapper-a */}
      <div className="text-center mb-6">
        <div className="flex justify-center items-center gap-4">
          {/* Group toggle */}
          <GroupButton
            isGrouped={groupByCompetition}
            onToggle={() => setGroupByCompetition((v) => !v)}
            size="sm"
            variant="modern"
            className="bg-gradient-to-r from-gray-700/80 to-gray-800/80 backdrop-blur-sm border-gray-600/30 hover:from-red-600/80 hover:to-red-700/80 hover:border-red-500/40"
          />

          {/* Time sort */}
          <TimeSortButton
            value={timeSortType}
            onChange={setTimeSortType}
            size="sm"
            variant="modern"
            className="rounded-full bg-gradient-to-r from-gray-700/80 to-gray-800/80 backdrop-blur-sm border-gray-600/30 hover:from-blue-600/80 hover:to-blue-700/80 hover:border-blue-500/40"
          />

          {/* Background refresh indicator */}
          {backgroundRefreshing && (
            <div className="bg-gradient-to-r from-blue-600/80 to-blue-700/80 backdrop-blur-sm text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-lg border border-blue-500/30 flex items-center gap-2">
              <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin"></div>
              Refreshing...
            </div>
          )}
        </div>

        {/* Sort indicator */}
        {timeSortType !== "smart" && (
          <div className="text-sm text-gray-400 mt-3">
            Sorted by:{" "}
            {timeSortType === "chronological"
              ? "Earliest first"
              : "Latest first"}
          </div>
        )}
      </div>

      {/* Matches Grid - direktno bez animation wrapper-a */}
      <MatchesGrid
        groupByCompetition={groupByCompetition}
        groupedMatches={groupedMatches}
        sortedMatches={sortedMatches}
        showLiveIndicator={true}
      />

      {/* Enhanced Refresh Controls - direktno bez animation wrapper-a */}
      <div className="flex justify-center items-center gap-4 mt-8 mb-4">
        <RefreshButton
          isLoading={backgroundRefreshing}
          onClick={handleAutoRefresh}
          size="lg"
          className="group relative overflow-hidden bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-bold px-8 py-4 rounded-xl shadow-lg hover:shadow-2xl hover:shadow-red-500/40 transition-all duration-300 hover:scale-105"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <span className="relative z-10 flex items-center gap-2">
            <span className={`${backgroundRefreshing ? "animate-spin" : ""}`}>
              🔄
            </span>
            {backgroundRefreshing ? "Refreshing..." : "Manual Refresh"}
          </span>
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
          className="md:hidden group relative overflow-hidden bg-gradient-to-r from-gray-700 to-gray-800 hover:from-gray-600 hover:to-gray-700 text-white px-4 py-2 rounded-xl border border-gray-600 hover:border-gray-500 transition-all duration-300 hover:scale-105 shadow-lg"
          title="Cycle sort type"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <span className="relative z-10">
            {timeSortType === "smart"
              ? "🤖"
              : timeSortType === "chronological"
              ? "⏰→"
              : "⏰←"}
          </span>
        </button>
      </div>
    </div>
  );
}
