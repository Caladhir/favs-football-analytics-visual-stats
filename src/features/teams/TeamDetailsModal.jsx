// src/features/teams/TeamDetailsModal.jsx - RED THEME VERSION
import React, { useState, useEffect } from "react";
import { Icon } from "@iconify-icon/react";
import supabase from "../../services/supabase";
import TeamLogo from "../../ui/TeamLogo";
import FormIndicator from "./FormIndicator";

export default function TeamDetailsModal({ team, isOpen, onClose }) {
  const [loading, setLoading] = useState(false);
  const [teamDetails, setTeamDetails] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    if (isOpen && team) {
      fetchTeamDetails();
    }
  }, [isOpen, team]);

  useEffect(() => {
    // Handle escape key
    const handleEscape = (e) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  const fetchTeamDetails = async () => {
    if (!team) return;

    setLoading(true);
    try {
      // Fetch recent matches
      const { data: matches } = await supabase
        .from("matches")
        .select("*")
        .or(`home_team.eq.${team.name},away_team.eq.${team.name}`)
        .order("start_time", { ascending: false })
        .limit(10);

      // Resolve team_id (leaders/stats objects don't include id)
      let resolvedTeamId = team.id;
      if (!resolvedTeamId) {
        // Try resolve by known IDs in object (sofascore_id) first
        if (team.sofascore_id) {
          const { data: bySofa } = await supabase
            .from("teams")
            .select("id")
            .eq("sofascore_id", team.sofascore_id)
            .limit(1);
          if (bySofa && bySofa.length > 0) {
            resolvedTeamId = bySofa[0].id;
          }
        }
        // Fallback by name
        if (!resolvedTeamId && team.name) {
          const { data: teamRows } = await supabase
            .from("teams")
            .select("id,name")
            .eq("name", team.name)
            .limit(1);
          if (teamRows && teamRows.length > 0) {
            resolvedTeamId = teamRows[0].id;
          }
        }
      }

      // Fetch players by resolved team_id
      let players = [];
      if (resolvedTeamId) {
        let { data: playersData } = await supabase
          .from("players")
          .select("*")
          .eq("team_id", resolvedTeamId)
          .order("number", { ascending: true })
          .limit(40);
        // Backward compatibility: older rows may only have team_sofascore_id
        if ((!playersData || playersData.length === 0) && team.sofascore_id) {
          const { data: legacyPlayers } = await supabase
            .from("players")
            .select("*")
            .eq("team_sofascore_id", team.sofascore_id)
            .order("number", { ascending: true })
            .limit(40);
          playersData = legacyPlayers || [];
        }
        players = playersData || [];
      }

      setTeamDetails({
        matches: matches || [],
        players: players || [],
      });
    } catch (error) {
      console.error("Error fetching team details:", error);
      setTeamDetails({ matches: [], players: [] });
    } finally {
      setLoading(false);
    }
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  const tabs = [
    { id: "overview", name: "Overview", icon: "mdi:chart-line" },
    { id: "matches", name: "Recent Matches", icon: "mdi:soccer" },
    { id: "players", name: "Squad", icon: "mdi:account-group" },
  ];

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-red-900 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden border border-red-500/30 shadow-2xl shadow-red-500/20">
        {/* Header */}
        <div className="relative p-6 border-b border-gray-700/50">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-red-500/20 to-white/10 rounded-t-2xl blur-sm opacity-50 pointer-events-none z-0" />
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <TeamLogo
                src={team?.logo_url}
                alt={`${team?.name || "Team"} logo`}
                className="w-16 h-16"
              />
              <div>
                <h2 className="text-2xl font-bold text-white">{team?.name}</h2>
                <p className="text-gray-400">
                  {team?.league} • {team?.country}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            >
              <Icon icon="mdi:close" width={24} className="text-white" />
            </button>
          </div>

          {/* Tabs */}
          <div className="relative z-10 flex gap-4 mt-6">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                  activeTab === tab.id
                    ? "bg-red-600 text-white"
                    : "bg-white/10 text-gray-400 hover:bg-white/20 hover:text-white"
                }`}
              >
                <Icon icon={tab.icon} width={16} />
                {tab.name}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500"></div>
            </div>
          ) : (
            <>
              {/* Overview Tab */}
              {activeTab === "overview" && (
                <div className="space-y-6">
                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white/5 rounded-lg p-4 text-center hover:bg-white/10 transition-colors">
                      <div className="text-2xl font-bold text-red-400">
                        {team?.points || 0}
                      </div>
                      <div className="text-xs text-gray-400">Points</div>
                    </div>
                    <div className="bg-white/5 rounded-lg p-4 text-center hover:bg-white/10 transition-colors">
                      <div className="text-2xl font-bold text-green-400">
                        {team?.wins || 0}
                      </div>
                      <div className="text-xs text-gray-400">Wins</div>
                    </div>
                    <div className="bg-white/5 rounded-lg p-4 text-center hover:bg-white/10 transition-colors">
                      <div className="text-2xl font-bold text-yellow-400">
                        {team?.draws || 0}
                      </div>
                      <div className="text-xs text-gray-400">Draws</div>
                    </div>
                    <div className="bg-white/5 rounded-lg p-4 text-center hover:bg-white/10 transition-colors">
                      <div className="text-2xl font-bold text-red-400">
                        {team?.losses || 0}
                      </div>
                      <div className="text-xs text-gray-400">Losses</div>
                    </div>
                  </div>

                  {/* Form */}
                  {team?.form && team.form.length > 0 && (
                    <div className="bg-white/5 rounded-lg p-4 hover:bg-white/10 transition-colors">
                      <h3 className="text-lg font-semibold mb-3 text-white">
                        Recent Form
                      </h3>
                      <div className="flex justify-center">
                        <FormIndicator form={team.form} />
                      </div>
                    </div>
                  )}

                  {/* Goals */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white/5 rounded-lg p-4 hover:bg-white/10 transition-colors">
                      <h4 className="text-sm font-semibold text-gray-400 mb-2">
                        Goals For
                      </h4>
                      <div className="text-2xl font-bold text-green-400">
                        {team?.goalsFor || 0}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        {team?.goalsPerMatch
                          ? `${team.goalsPerMatch} per match`
                          : ""}
                      </div>
                    </div>
                    <div className="bg-white/5 rounded-lg p-4 hover:bg-white/10 transition-colors">
                      <h4 className="text-sm font-semibold text-gray-400 mb-2">
                        Goals Against
                      </h4>
                      <div className="text-2xl font-bold text-red-400">
                        {team?.goalsAgainst || 0}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        {team?.goalsConcededPerMatch
                          ? `${team.goalsConcededPerMatch} per match`
                          : ""}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Matches Tab */}
              {activeTab === "matches" && (
                <div className="space-y-4">
                  {teamDetails?.matches?.length > 0 ? (
                    teamDetails.matches.map((match, idx) => (
                      <div
                        key={idx}
                        className="bg-white/5 rounded-lg p-4 hover:bg-white/10 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="text-sm font-medium text-white">
                              {match.home_team} vs {match.away_team}
                            </div>
                            <div className="text-xs text-gray-400 mt-1">
                              {new Date(match.start_time).toLocaleDateString()}{" "}
                              • {match.competition}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold text-white">
                              {match.home_score || 0} - {match.away_score || 0}
                            </div>
                            <div
                              className={`text-xs px-2 py-1 rounded-full ${
                                match.status === "finished"
                                  ? "bg-green-500/20 text-green-400"
                                  : match.status === "live"
                                  ? "bg-red-500/20 text-red-400"
                                  : "bg-blue-500/20 text-blue-400"
                              }`}
                            >
                              {match.status}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-gray-400">
                      <div className="text-4xl mb-2">⚽</div>
                      <p>No recent matches available</p>
                    </div>
                  )}
                </div>
              )}

              {/* Players Tab */}
              {activeTab === "players" && (
                <div className="space-y-4">
                  {teamDetails?.players?.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {teamDetails.players.map((player, idx) => (
                        <div
                          key={idx}
                          className="bg-white/5 rounded-lg p-4 hover:bg-white/10 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-red-500/20 rounded-full flex items-center justify-center text-sm font-bold text-red-400">
                              {player.number || "?"}
                            </div>
                            <div className="flex-1">
                              <div className="text-sm font-medium text-white">
                                {player.full_name}
                              </div>
                              <div className="text-xs text-gray-400">
                                {player.position}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-400">
                      <div className="text-4xl mb-2">👥</div>
                      <p>No squad information available</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
