// src/pages/app_layout/Teams.jsx - FINALNO AŽURIRANO S NOVIM BUTTON KOMPONENTAMA
import { useState, useEffect } from "react";
import { useTeamsData } from "../../hooks/useTeamsData";
import AnimatedBackground from "../../features/homepage/AnimatedBackground";
import FormIndicator from "../../features/teams/FormIndicator";
import LeagueLeadersTable from "../../features/teams/LeagueLeadersTable";
import StatsCards from "../../features/teams/StatsCards";
import TeamDetailsModal from "../../features/teams/TeamDetailsModal";

// Import novih button komponenti
import { RefreshButton } from "../../ui/SpecializedButtons";
import Button from "../../ui/Button";

export default function Teams() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const {
    leagueLeaders,
    bestAttack,
    bestDefense,
    bestForm,
    loading,
    error,
    refetch,
  } = useTeamsData();

  useEffect(() => {
    const timer = setTimeout(() => setIsLoaded(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const handleTeamDetails = (team) => {
    setSelectedTeam(team);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedTeam(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-red-950 text-white overflow-hidden relative">
      {/* Koristi shared AnimatedBackground komponentu */}
      <AnimatedBackground />

      <div className="relative z-10">
        {/* Hero Header */}
        <section
          className={`text-center pt-12 pb-8 px-4 transition-all duration-1000 ${
            isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          <div className="mb-8">
            <h1 className="font-black text-6xl md:text-7xl mb-4 text-red-500 animate-pulse-slow">
              Football Teams
            </h1>
            <p className="text-xl md:text-2xl text-gray-300 font-light tracking-wider">
              Overview of teams from major European leagues and their statistics
            </p>
          </div>

          {/* Ažurirani refresh button
          <div className="flex justify-center gap-4">
            <RefreshButton isLoading={loading} onClick={refetch} size="lg">
              Refresh Data
            </RefreshButton>
          </div> */}
        </section>

        <div className="container mx-auto px-6 pb-12 space-y-12">
          {/* Error State */}
          {error && (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">⚠️</div>
              <p className="text-xl font-bold mb-2 text-red-400">
                Error Loading Teams
              </p>
              <p className="text-gray-400 mb-4">{error}</p>

              {/* Ažurirani error button */}
              <Button variant="danger" onClick={refetch} leftIcon="mdi:refresh">
                Try Again
              </Button>
            </div>
          )}

          {/* League Leaders Table */}
          {!error && (
            <div
              className={`transition-all duration-700 ${
                isLoaded
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-8"
              }`}
            >
              <LeagueLeadersTable
                teams={leagueLeaders}
                loading={loading}
                onTeamDetails={handleTeamDetails}
              />
            </div>
          )}

          {/* Stats Cards */}
          {!error && (
            <div
              className={`transition-all duration-700 delay-300 ${
                isLoaded
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-8"
              }`}
            >
              <StatsCards
                bestAttack={bestAttack}
                bestDefense={bestDefense}
                bestForm={bestForm}
                loading={loading}
                onTeamClick={handleTeamDetails}
              />
            </div>
          )}

          {/* Coming Soon Banner - Enhanced */}
          {!loading && !error && leagueLeaders.length > 0 && (
            <div
              className={`transition-all duration-700 delay-500 ${
                isLoaded
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-8"
              }`}
            >
              <div className="relative bg-gradient-to-r from-red-900/50 to-gray-900/50 rounded-2xl p-8 text-center border border-red-500/30 backdrop-blur-sm hover:border-red-500/50 transition-colors">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-red-500/20 to-white/10 rounded-2xl blur-sm opacity-50" />
                <div className="relative">
                  <h3 className="text-3xl font-bold mb-4 bg-gradient-to-r from-red-400 to-white bg-clip-text text-transparent">
                    🚀 Coming Soon
                  </h3>
                  <p className="text-gray-300 text-lg max-w-3xl mx-auto mb-6">
                    Detaljni profili timova, upravljanje sastavom, povijest
                    transfera, head-to-head statistike, analiza performansi,
                    taktička analiza i puno više!
                  </p>

                  {/* Call-to-action buttons */}
                  <div className="flex flex-col sm:flex-row gap-4 justify-center">
                    <Button
                      variant="outline"
                      leftIcon="mdi:bell-outline"
                      className="border-red-500 text-red-500 hover:bg-red-500 hover:text-white"
                    >
                      Notify Me
                    </Button>

                    <Button variant="ghost" leftIcon="mdi:lightbulb-outline">
                      Suggest Feature
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Team Details Modal */}
      <TeamDetailsModal
        team={selectedTeam}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
      />
    </div>
  );
}
