// src/hooks/useTeamsData.js
import { useLeagueTable } from "./useLeagueTable";
import { useTeamForm30d } from "./useTeamForm30d";

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
    bestForm: legacyBestForm,
    loading: statsLoading,
    error: statsError,
    refetch: refetchStats,
  } = useLeagueTable({
    daysBack: 30,
    mode: "stats",
    includeForm: true,
  });

  // Unified 30-day form (wins/goals based) replacing legacy bestForm
  const {
    teams: unifiedFormTeams,
    loading: formLoading,
    error: formError,
    refetch: refetchUnifiedForm,
  } = useTeamForm30d({ limit: 5 });

  // Combined states
  const loading = leadersLoading || statsLoading || formLoading;
  const error = leadersError || statsError || formError;

  const refetch = () => {
    refetchLeaders();
    refetchStats();
    refetchUnifiedForm();
  };

  return {
    leagueLeaders: leagueLeaders || [],
    bestAttack: bestAttack || [],
    bestDefense: bestDefense || [],
    // Map unified dataset last5 -> form for UI component compatibility
    bestForm:
      (unifiedFormTeams || []).map((t) => ({
        ...t,
        form: t.last5,
      })) ||
      legacyBestForm ||
      [],
    loading,
    error,
    refetch,
  };
}
