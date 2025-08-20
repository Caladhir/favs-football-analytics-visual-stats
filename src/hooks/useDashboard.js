// src/hooks/useDashboard.js - FIXED VERSION using existing useLiveMatches
import { useMemo } from "react";
import { useQuickStats } from "./useQuickStats";
import { useStatOfTheDay } from "./useStatOfTheDay";
import { useUpsetAlert } from "./useUpsetAlert";
import { useFormGuide } from "./useFormGuide";
import { useLiveMatches } from "./useLiveMatches"; // ✅ Use existing hook
import { useTopScorers } from "./useTopScorers";
import { useLeagueTable } from "./useLeagueTable";
import { useXgVsGoals } from "./useXgVsGoals";
import { useBestWorstPerformers } from "./useBestWorstPerformers";
import { useActivityHeatmap } from "./useActivityHeatmap";

export function useDashboard() {
  const quickStats = useQuickStats();
  const statOfTheDay = useStatOfTheDay();
  const upsetAlert = useUpsetAlert();
  const formGuide = useFormGuide();
  const liveMatches = useLiveMatches(); // ✅ Much better than custom hook
  const topScorers = useTopScorers(5);
  const leagueTable = useLeagueTable(30, 6);
  const xgVsGoals = useXgVsGoals(21, 4);
  const bestWorstPerformers = useBestWorstPerformers(7, 3);
  const activityHeatmap = useActivityHeatmap(7);

  // Combined loading state
  const isLoading = useMemo(() => {
    return [
      quickStats.loading,
      statOfTheDay.loading,
      upsetAlert.loading,
      formGuide.loading,
      liveMatches.loading, // ✅ Using existing hook
      topScorers.loading,
      leagueTable.loading,
      xgVsGoals.loading,
      bestWorstPerformers.loading,
      activityHeatmap.loading,
    ].some(Boolean);
  }, [
    quickStats.loading,
    statOfTheDay.loading,
    upsetAlert.loading,
    formGuide.loading,
    liveMatches.loading,
    topScorers.loading,
    leagueTable.loading,
    xgVsGoals.loading,
    bestWorstPerformers.loading,
    activityHeatmap.loading,
  ]);

  // Combined error state
  const hasError = useMemo(() => {
    return [
      quickStats.error,
      statOfTheDay.error,
      upsetAlert.error,
      formGuide.error,
      liveMatches.error,
      topScorers.error,
      leagueTable.error,
      xgVsGoals.error,
      bestWorstPerformers.error,
      activityHeatmap.error,
    ].some(Boolean);
  }, [
    quickStats.error,
    statOfTheDay.error,
    upsetAlert.error,
    formGuide.error,
    liveMatches.error,
    topScorers.error,
    leagueTable.error,
    xgVsGoals.error,
    bestWorstPerformers.error,
    activityHeatmap.error,
  ]);

  // Refresh all data
  const refreshAll = async () => {
    const refreshPromises = [
      quickStats.refetch(),
      statOfTheDay.refetch(),
      upsetAlert.refetch(),
      formGuide.refetch(),
      liveMatches.refreshNow(), // ✅ Using existing method
      topScorers.refetch(),
      leagueTable.refetch(),
      xgVsGoals.refetch(),
      bestWorstPerformers.refetch(),
      activityHeatmap.refetch(),
    ];

    try {
      await Promise.allSettled(refreshPromises);
    } catch (error) {
      console.error("Error refreshing dashboard data:", error);
    }
  };

  return {
    // Individual hook data
    quickStats: quickStats.stats,
    statOfTheDay: statOfTheDay.stat,
    upsetAlert: upsetAlert.upset,
    formGuide: formGuide.summary,
    liveResults: liveMatches.matches, // ✅ From existing hook
    liveCount: liveMatches.liveCount, // ✅ Bonus - live count
    isRealtimeActive: liveMatches.isRealtimeActive, // ✅ Bonus - realtime status
    topScorers: topScorers.scorers,
    leagueTable: leagueTable.teams,
    xgVsGoals: xgVsGoals.teams,
    bestWorstPerformers: bestWorstPerformers.performers,
    activityHeatmap: activityHeatmap.hourlyData,

    // Individual loading states
    loading: {
      quickStats: quickStats.loading,
      statOfTheDay: statOfTheDay.loading,
      upsetAlert: upsetAlert.loading,
      formGuide: formGuide.loading,
      liveResults: liveMatches.loading,
      topScorers: topScorers.loading,
      leagueTable: leagueTable.loading,
      xgVsGoals: xgVsGoals.loading,
      bestWorstPerformers: bestWorstPerformers.loading,
      activityHeatmap: activityHeatmap.loading,
    },

    // Individual error states
    errors: {
      quickStats: quickStats.error,
      statOfTheDay: statOfTheDay.error,
      upsetAlert: upsetAlert.error,
      formGuide: formGuide.error,
      liveResults: liveMatches.error,
      topScorers: topScorers.error,
      leagueTable: leagueTable.error,
      xgVsGoals: xgVsGoals.error,
      bestWorstPerformers: bestWorstPerformers.error,
      activityHeatmap: activityHeatmap.error,
    },

    // Combined states
    isLoading,
    hasError,
    refreshAll,

    // ✅ Extra live matches functionality from existing hook
    backgroundRefreshing: liveMatches.backgroundRefreshing,
    lastRefreshed: liveMatches.lastRefreshed,
  };
}
