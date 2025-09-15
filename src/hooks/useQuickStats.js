// src/hooks/useQuickStats.js
import { useState, useEffect, useCallback, useRef } from "react";
import supabase from "../services/supabase";
// Reuse unified filtering logic so liveNowStrict matches the Live tab rules
import { getValidLiveMatchesUnified } from "../utils/liveMatchFilters";
import { LIVE_STALE_SEC, MAX_LIVE_AGE_HOURS } from "../services/live";

export function useQuickStats() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({
    matchesToday: 0, // ALL matches (any status) starting today (local day)
    scheduledToday: 0, // status === 'scheduled'
    liveNowAll: 0, // candidate live matches (status in LIVE set) ignoring staleness + age
    liveNowStrict: 0, // filtered by unified filter (age + staleness)
    finishedToday: 0, // status === 'finished'
    avgGoals7d: 0,
    activePlayers7d: 0, // kept for backward compat; now equals totalPlayers
    totalPlayers: 0,
    coverage: {
      // quick derived ratios
      strictLiveAcceptance: 0, // liveNowStrict / liveNowAll
    },
  });
  const [meta, setMeta] = useState({
    fallbackUsed: false,
    playerStatsTableEmpty: false,
    lineupsContribution: 0,
    playerStatsContribution: 0,
    // live filtering diagnostics
    liveCandidates: 0,
    liveTooOld: 0,
    liveStale: 0,
  });

  const mountedRef = useRef(true);

  const fetchStats = useCallback(async () => {
    if (!mountedRef.current) return;

    try {
      setLoading(true);
      setError(null);

      const now = new Date();
      // Use LOCAL day boundary because user expectation (more matches) likely based on local calendar day
      const startOfDay = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
      );
      const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
      // Rolling 7-day window (inclusive start) for aggregates (still uses absolute timestamps)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      // We expand the live candidate window slightly (startOfDay - 4h) to catch matches that started late last night but are still live after midnight.
      const liveWindowStart = new Date(
        startOfDay.getTime() - 4 * 60 * 60 * 1000
      );

      // Parallel queries for better performance.
      // 1. matchesToday: all matches any status (count)
      // 2. scheduledToday: scheduled only (count)
      // 3. finishedToday: finished only (count)
      // 4. liveCandidatesData: rows with potential live statuses for strict filtering & diagnostics
      // 5. finishedWeekMatchesResult: for avg goals 7d
      // 6. playersCountResult: total players in DB (simplified metric)
      const [
        matchesTodayResult,
        scheduledTodayResult,
        finishedTodayResult,
        liveCandidatesData,
        finishedWeekMatchesResult,
        playersCountResult,
      ] = await Promise.all([
        supabase
          .from("matches")
          .select("id", { count: "exact", head: true })
          .gte("start_time", startOfDay.toISOString())
          .lt("start_time", endOfDay.toISOString()),

        supabase
          .from("matches")
          .select("id", { count: "exact", head: true })
          .eq("status", "scheduled")
          .gte("start_time", startOfDay.toISOString())
          .lt("start_time", endOfDay.toISOString()),

        supabase
          .from("matches")
          .select("id", { count: "exact", head: true })
          .eq("status", "finished")
          .gte("start_time", startOfDay.toISOString())
          .lt("start_time", endOfDay.toISOString()),

        supabase
          .from("matches")
          .select("id,start_time,updated_at,status,home_team,away_team")
          .in("status", ["live", "ht", "inprogress", "halftime"])
          .gte("start_time", liveWindowStart.toISOString())
          .lt("start_time", endOfDay.toISOString()),

        supabase
          .from("matches")
          .select("id,home_score,away_score")
          .gte("start_time", sevenDaysAgo.toISOString())
          .lte("start_time", now.toISOString())
          .eq("status", "finished"),

        supabase.from("players").select("id", { count: "exact", head: true }),
      ]);

      if (!mountedRef.current) return;

      // Process results
      const matchesToday = matchesTodayResult.count || 0;
      const scheduledToday = scheduledTodayResult.count || 0;
      const finishedToday = finishedTodayResult.count || 0;

      // Live candidate analysis
      const liveCandidates = liveCandidatesData.data || [];
      const liveNowAll = liveCandidates.length;
      // Apply strict filter (age + staleness)
      const strictlyValid = getValidLiveMatchesUnified(liveCandidates, {
        staleCutoffSec: LIVE_STALE_SEC,
        maxAgeHours: MAX_LIVE_AGE_HOURS,
        strict: true,
      });
      const liveNowStrict = strictlyValid.length;
      // Diagnostics: why rejected
      let liveTooOld = 0,
        liveStale = 0;
      const nowMs = Date.now();
      liveCandidates.forEach((m) => {
        const startTs = new Date(m.start_time).getTime();
        if (Number.isFinite(startTs)) {
          const hoursElapsed = (nowMs - startTs) / (1000 * 60 * 60);
          if (hoursElapsed > MAX_LIVE_AGE_HOURS) {
            liveTooOld += 1;
            return;
          }
        }
        // staleness (skip if candidate would fail age first)
        if (m.updated_at) {
          const upd = new Date(m.updated_at).getTime();
          if (Number.isFinite(upd) && nowMs - upd > LIVE_STALE_SEC * 1000) {
            liveStale += 1;
            return;
          }
        }
      });

      const finishedWeekMatches = finishedWeekMatchesResult.data || [];
      const totalGoals = finishedWeekMatches.reduce(
        (sum, match) => sum + (match.home_score || 0) + (match.away_score || 0),
        0
      );
      const avgGoals = finishedWeekMatches.length
        ? totalGoals / finishedWeekMatches.length
        : 0;

      // Simplified: just total players count
      const totalPlayers = playersCountResult?.count || 0;

      const strictLiveAcceptance = liveNowAll ? liveNowStrict / liveNowAll : 0;

      const computed = {
        matchesToday,
        scheduledToday,
        liveNowAll,
        liveNowStrict,
        finishedToday,
        avgGoals7d: Number(avgGoals.toFixed(2)),
        activePlayers7d: totalPlayers, // backward compat
        totalPlayers,
        coverage: {
          strictLiveAcceptance: Number(strictLiveAcceptance.toFixed(3)),
        },
      };
      const playerStatsTableEmpty = true; // not used anymore but kept in meta for now
      const fallbackUsed = false;
      setMeta({
        fallbackUsed,
        playerStatsTableEmpty,
        lineupsContribution: 0,
        playerStatsContribution: 0,
        liveCandidates: liveNowAll,
        liveTooOld,
        liveStale,
      });
      console.debug("[useQuickStats] stats computed", computed, {
        finishedWeekMatches: finishedWeekMatches.length,
        playerStatsTableEmpty,
        liveTooOld,
        liveStale,
      });
      setStats(computed);
    } catch (err) {
      if (!mountedRef.current) return;
      console.error("Error fetching quick stats:", err);
      setError(err.message || "Failed to load stats");
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchStats();

    return () => {
      mountedRef.current = false;
    };
  }, [fetchStats]);

  return { stats, loading, error, refetch: fetchStats };
}
