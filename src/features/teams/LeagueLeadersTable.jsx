// src/components/teams/LeagueLeadersTable.jsx - RED THEME VERSION
import React from "react";
import { Icon } from "@iconify-icon/react";
import FormIndicator from "./FormIndicator";

export default function LeagueLeadersTable({
  teams = [],
  loading = false,
  onTeamDetails,
}) {
  if (loading) {
    return (
      <div className="bg-card/80 backdrop-blur-sm rounded-2xl shadow-xl border border-border/50 overflow-hidden">
        <div className="p-6">
          <div className="mb-6">
            <div className="h-6 w-48 bg-muted/40 rounded animate-pulse mb-2" />
            <div className="h-4 w-96 bg-muted/40 rounded animate-pulse" />
          </div>

          <div className="space-y-3">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="h-16 bg-muted/40 rounded-lg animate-pulse"
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const handleDetailsClick = (team) => {
    if (onTeamDetails) {
      onTeamDetails(team);
    }
  };

  return (
    <div className="bg-card/80 backdrop-blur-sm rounded-2xl shadow-xl border border-border/50 overflow-hidden hover:border-red-500/30 transition-colors">
      <div className="p-6">
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
            🏆 League Leaders
          </h2>
          <p className="text-gray-400 text-sm">
            Top teams from major European leagues
          </p>
        </div>

        {/* Teams List */}
        <div className="space-y-2">
          {teams.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-3">⚽</div>
              <p className="text-gray-400">No league leaders found</p>
            </div>
          ) : (
            teams.map((team, index) => (
              <div
                key={team.id}
                className="group flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 rounded-lg transition-all duration-300 hover:scale-[1.02] cursor-pointer border border-transparent hover:border-red-500/30"
                onClick={() => handleDetailsClick(team)}
              >
                <div className="flex items-center gap-4 flex-1">
                  {/* Position */}
                  <div className="text-gray-400 text-sm font-medium w-6">
                    {index + 1}
                  </div>

                  {/* Team info */}
                  <div className="flex items-center gap-3 flex-1">
                    <div className="w-8 h-8 bg-gradient-to-br from-red-500/30 to-white/20 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                      <span className="text-xs font-bold">⚽</span>
                    </div>
                    <div>
                      <div className="text-white font-semibold group-hover:text-red-400 transition-colors">
                        {team.name}
                      </div>
                      <div className="text-gray-400 text-sm">{team.league}</div>
                    </div>
                  </div>

                  {/* Form - Hidden on mobile */}
                  <div className="hidden md:block">
                    <FormIndicator form={team.form} />
                  </div>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-6 lg:gap-8">
                  {/* Points - Hidden on mobile */}
                  <div className="text-center hidden lg:block">
                    <div className="text-white font-bold text-lg">
                      {team.points}
                    </div>
                    <div className="text-gray-400 text-xs">Points</div>
                  </div>

                  {/* Matches - Hidden on small screens */}
                  <div className="text-center hidden md:block">
                    <div className="text-white font-bold">{team.matches}</div>
                    <div className="text-gray-400 text-xs">Matches</div>
                  </div>

                  {/* Goals */}
                  <div className="text-center">
                    <div className="text-white font-bold">
                      {team.goalsFor}:{team.goalsAgainst}
                    </div>
                    <div className="text-gray-400 text-xs">Goals</div>
                  </div>

                  {/* Details button */}
                  <button
                    className="flex items-center gap-1 px-3 py-1 bg-red-600 hover:bg-red-700 rounded-lg transition-colors text-sm text-white group-hover:bg-red-500"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDetailsClick(team);
                    }}
                  >
                    <Icon icon="mdi:eye" width={16} />
                    <span className="hidden sm:inline">Details</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer info */}
        {teams.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-700/50 text-center">
            <p className="text-gray-400 text-xs">
              Showing {teams.length} league leaders • Last 30 days
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
