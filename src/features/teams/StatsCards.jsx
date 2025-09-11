// src/components/teams/StatsCards.jsx - RED THEME VERSION
import React from "react";
import FormIndicator from "./FormIndicator";
import TeamLogo from "../../ui/TeamLogo";

// Individual Stat Card Component
function StatCard({
  title,
  subtitle,
  icon,
  data = [],
  valueKey,
  loading = false,
  onTeamClick,
}) {
  if (loading) {
    return (
      <div className="bg-card/80 backdrop-blur-sm rounded-2xl shadow-xl border border-border/50 overflow-hidden">
        <div className="p-6">
          <div className="h-6 w-32 bg-muted/40 rounded animate-pulse mb-1" />
          <div className="h-4 w-48 bg-muted/40 rounded animate-pulse mb-4" />

          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-8 bg-muted/40 rounded animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const handleTeamClick = (team) => {
    if (onTeamClick) {
      onTeamClick(team);
    }
  };

  return (
    <div className="bg-card/80 backdrop-blur-sm rounded-2xl shadow-xl border border-border/50 overflow-hidden group hover:border-red-500/30 transition-colors">
      <div className="p-6">
        {/* Header */}
        <div className="mb-4">
          <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
            {icon} {title}
          </h3>
          <p className="text-gray-400 text-sm">{subtitle}</p>
        </div>

        {/* Data List */}
        <div className="space-y-3">
          {data.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-gray-400 text-sm">No data available</p>
            </div>
          ) : (
            data.slice(0, 3).map((team, index) => (
              <div
                key={team.name}
                className="flex items-center justify-between p-2 hover:bg-white/5 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-red-500/20"
                onClick={() => handleTeamClick(team)}
              >
                <div className="flex items-center gap-3">
                  <span className="text-gray-400 text-sm font-medium w-6">
                    #{index + 1}
                  </span>
                  <TeamLogo
                    src={team.logo_url}
                    alt={`${team.name} logo`}
                    className="w-6 h-6"
                  />
                  <span className="text-white font-medium hover:text-red-400 transition-colors">
                    {team.name}
                  </span>
                </div>

                {/* Value display */}
                <div className="font-bold">
                  {valueKey === "form" ? (
                    <FormIndicator form={team.form} />
                  ) : (
                    <span
                      className={`
                      ${valueKey === "goalsPerMatch" ? "text-red-400" : ""}
                      ${
                        valueKey === "goalsConcededPerMatch" ? "text-white" : ""
                      }
                      ${valueKey === "points" ? "text-red-400" : ""}
                    `}
                    >
                      {team[valueKey]}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {data.length > 3 && (
          <div className="mt-4 pt-3 border-t border-gray-700/50 text-center">
            <p className="text-gray-400 text-xs">
              Showing top 3 of {data.length} teams
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// Main StatsCards Component
export default function StatsCards({
  bestAttack = [],
  bestDefense = [],
  bestForm = [],
  loading = false,
  onTeamClick,
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Best Attack Card */}
      <StatCard
        title="Best Attack"
        subtitle="Goals per match"
        icon="⚡️"
        data={bestAttack}
        valueKey="goalsPerMatch"
        loading={loading}
        onTeamClick={onTeamClick}
      />

      {/* Best Defense Card */}
      <StatCard
        title="Best Defense"
        subtitle="Goals conceded per match"
        icon="🛡️"
        data={bestDefense}
        valueKey="goalsConcededPerMatch"
        loading={loading}
        onTeamClick={onTeamClick}
      />

      {/* Best Form Card */}
      <StatCard
        title="Best Form"
        subtitle="Last 5 matches"
        icon="🔥"
        data={bestForm}
        valueKey="form"
        loading={loading}
        onTeamClick={onTeamClick}
      />
    </div>
  );
}
