// src/hooks/useTeamsData.js
import { useLeagueTable } from "./useLeagueTable";

export function useTeamsData() {
  // Get league leaders
  const {
    leagueLeaders,
    loading: leadersLoading,
    error: leadersError,
    refetch: refetchLeaders,
  } = useLeagueTable({
    daysBack: 30,
    mode: "leaders",
    includeForm: true,
  });

  // Get best attack/defense/form stats
  const {
    bestAttack,
    bestDefense,
    bestForm,
    loading: statsLoading,
    error: statsError,
    refetch: refetchStats,
  } = useLeagueTable({
    daysBack: 30,
    mode: "stats",
    includeForm: true,
  });

  // Combined states
  const loading = leadersLoading || statsLoading;
  const error = leadersError || statsError;

  const refetch = () => {
    refetchLeaders();
    refetchStats();
  };

  return {
    leagueLeaders: leagueLeaders || [],
    bestAttack: bestAttack || [],
    bestDefense: bestDefense || [],
    bestForm: bestForm || [],
    loading,
    error,
    refetch,
  };
}
