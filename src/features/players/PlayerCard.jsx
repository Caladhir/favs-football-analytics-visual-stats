//features/players/PlayerCard.jsx
import { User, TrendingUp, Target, Users, Award, Clock } from "lucide-react";

const PlayerCard = ({ player, onClick }) => {
  if (!player) return null;

  const {
    full_name = "Unknown Player",
    position,
    number,
    nationality,
    height_cm,
    teams,
    stats = {},
  } = player;

  // Pozicijske ikone bez emoji-ja
  const getPositionInfo = (pos) => {
    if (!pos) return { name: "Unknown Position", color: "text-gray-400" };

    const positionMap = {
      GK: { name: "Goalkeeper", color: "text-orange-400" },
      CB: { name: "Centre Back", color: "text-blue-400" },
      LB: { name: "Left Back", color: "text-blue-400" },
      RB: { name: "Right Back", color: "text-blue-400" },
      CDM: { name: "Defensive Midfielder", color: "text-green-400" },
      CM: { name: "Central Midfielder", color: "text-green-400" },
      CAM: { name: "Attacking Midfielder", color: "text-purple-400" },
      LW: { name: "Left Winger", color: "text-purple-400" },
      RW: { name: "Right Winger", color: "text-purple-400" },
      ST: { name: "Striker", color: "text-red-400" },
    };

    return positionMap[pos] || { name: pos, color: "text-gray-400" };
  };

  const positionInfo = getPositionInfo(position);

  const handleClick = () => {
    if (onClick) {
      onClick(player);
    }
  };

  return (
    <div
      onClick={handleClick}
      className="group relative bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20 hover:border-red-500/50 hover:bg-white/15 transition-all duration-300 cursor-pointer transform hover:scale-105 hover:shadow-2xl hover:shadow-red-500/20"
    >
      {/* Glow effect on hover */}
      <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-red-500/0 via-red-500/5 to-red-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      {/* Header */}
      <div className="relative flex items-start justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center">
            <User className="w-6 h-6 text-red-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white group-hover:text-red-400 transition-colors">
              {full_name}
            </h3>
            <div className="flex items-center space-x-2 text-sm text-gray-400">
              {position && (
                <span
                  className={`bg-gray-700/50 px-2 py-1 rounded text-xs font-mono uppercase ${positionInfo.color}`}
                >
                  {position}
                </span>
              )}
              {number && (
                <span className="text-red-400 font-bold">#{number}</span>
              )}
            </div>
          </div>
        </div>

        {/* Rating badge */}
        {stats.rating > 0 && (
          <div className="bg-gradient-to-r from-yellow-500/20 to-orange-500/20 px-3 py-1 rounded-full border border-yellow-500/30">
            <div className="flex items-center space-x-1">
              <Award className="w-3 h-3 text-yellow-400" />
              <span className="text-yellow-400 font-bold text-sm">
                {stats.rating}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Team & Nationality Info */}
      <div className="mb-4 space-y-2">
        {teams && (
          <div className="flex items-center space-x-2 text-sm text-gray-300">
            <Users className="w-4 h-4 text-blue-400" />
            <span>{teams.name || teams.short_name || "Unknown Team"}</span>
            {teams.country && (
              <span className="text-gray-500">• {teams.country}</span>
            )}
          </div>
        )}

        <div className="flex items-center space-x-2 text-sm text-gray-300">
          {nationality && (
            <>
              <span>{nationality}</span>
              {height_cm && (
                <span className="text-gray-500">• {height_cm}cm</span>
              )}
            </>
          )}
          {!nationality && height_cm && <span>{height_cm}cm</span>}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-black/20 rounded-lg p-3">
          <div className="flex items-center space-x-2 mb-1">
            <Target className="w-4 h-4 text-red-400" />
            <span className="text-xs text-gray-400 uppercase tracking-wide">
              Goals
            </span>
          </div>
          <div className="text-xl font-bold text-white">{stats.goals || 0}</div>
          {stats.games > 0 && (
            <div className="text-xs text-gray-500">
              {stats.goalsPerGame} per game
            </div>
          )}
        </div>

        <div className="bg-black/20 rounded-lg p-3">
          <div className="flex items-center space-x-2 mb-1">
            <TrendingUp className="w-4 h-4 text-blue-400" />
            <span className="text-xs text-gray-400 uppercase tracking-wide">
              Assists
            </span>
          </div>
          <div className="text-xl font-bold text-white">
            {stats.assists || 0}
          </div>
          {stats.games > 0 && (
            <div className="text-xs text-gray-500">
              {stats.assistsPerGame} per game
            </div>
          )}
        </div>
      </div>

      {/* Additional Stats Row */}
      <div className="flex justify-between items-center text-sm text-gray-400 pt-3 border-t border-white/10">
        <div className="flex items-center space-x-1">
          <Clock className="w-4 h-4" />
          <span>{stats.games || 0} games</span>
        </div>

        {stats.minutes > 0 && (
          <div>
            <span>{Math.round(stats.minutes / 60)}h played</span>
          </div>
        )}

        {stats.passes > 0 && (
          <div>
            <span>{stats.passes} passes</span>
          </div>
        )}
      </div>

      {/* Hover indicator */}
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
      </div>
    </div>
  );
};

export default PlayerCard;
