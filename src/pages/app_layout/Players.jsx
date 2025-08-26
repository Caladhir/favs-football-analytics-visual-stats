import { useState, useEffect } from "react";
import {
  Search,
  Filter,
  Users,
  TrendingUp,
  Target,
  Award,
  Database,
  Plus,
} from "lucide-react";
import AnimatedBackground from "../../features/homepage/AnimatedBackground";
import { usePlayersData } from "../../hooks/usePlayersData";
import PlayerCard from "../../features/players/PlayerCard";
import PlayerDetailModal from "../../features/players/PlayerDetailModal";

// Simple button components
const PillButton = ({
  children,
  active = false,
  onClick,
  size = "sm",
  className = "",
}) => {
  const sizeClasses = {
    sm: "px-3 py-1 text-sm",
    md: "px-4 py-2 text-base",
    lg: "px-6 py-3 text-lg",
  };

  return (
    <button
      onClick={onClick}
      className={`
        ${sizeClasses[size]}
        rounded-full font-medium transition-all duration-300
        ${
          active
            ? "bg-red-500 text-white shadow-lg shadow-red-500/25"
            : "bg-white/10 text-gray-300 hover:bg-white/20 hover:text-white"
        }
        ${className}
      `}
    >
      {children}
    </button>
  );
};

const EmptyStateMessage = ({ onAddData }) => (
  <div className="text-center py-16">
    <Database className="w-16 h-16 mx-auto mb-6 text-gray-400 opacity-50" />
    <h3 className="text-2xl font-bold mb-4 text-white">
      No Players Found in Database
    </h3>
    <p className="text-gray-400 mb-8 max-w-md mx-auto">
      Your players table is empty. You need to add player data to see them here.
    </p>

    <div className="space-y-4">
      <div className="bg-white/5 backdrop-blur-sm rounded-lg p-6 max-w-2xl mx-auto text-left">
        <h4 className="text-lg font-semibold text-white mb-3 flex items-center">
          <Plus className="w-5 h-5 mr-2" />
          How to Add Players Data:
        </h4>
        <div className="space-y-3 text-sm text-gray-300">
          <div className="flex items-start space-x-3">
            <span className="bg-red-500/20 text-red-400 px-2 py-1 rounded text-xs font-mono">
              1
            </span>
            <p>
              Run your scraper to populate the database with player data from
              SofaScore
            </p>
          </div>
          <div className="flex items-start space-x-3">
            <span className="bg-red-500/20 text-red-400 px-2 py-1 rounded text-xs font-mono">
              2
            </span>
            <p>
              Or manually insert players into the{" "}
              <code className="bg-gray-800 px-1 rounded">players</code> table
              via Supabase dashboard
            </p>
          </div>
          <div className="flex items-start space-x-3">
            <span className="bg-red-500/20 text-red-400 px-2 py-1 rounded text-xs font-mono">
              3
            </span>
            <p>
              Make sure to also populate{" "}
              <code className="bg-gray-800 px-1 rounded">teams</code> and{" "}
              <code className="bg-gray-800 px-1 rounded">player_stats</code>{" "}
              tables
            </p>
          </div>
        </div>
      </div>

      <button
        onClick={onAddData}
        className="px-6 py-3 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors border border-red-500/30"
      >
        Check Database Schema
      </button>
    </div>
  </div>
);

export default function Players() {
  // UI State
  const [isLoaded, setIsLoaded] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [showPlayerModal, setShowPlayerModal] = useState(false);

  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPosition, setSelectedPosition] = useState("all");
  const [selectedLeague, setSelectedLeague] = useState("all");
  const [sortBy, setSortBy] = useState("name");

  useEffect(() => {
    setIsLoaded(true);
  }, []);

  // Fetch real data from your database
  const {
    players,
    loading,
    error,
    total,
    leagues,
    positions,
    refetch,
    topScorers,
    topAssists,
    topRated,
    isEmpty,
    hasData,
  } = usePlayersData({
    limit: 100,
    position: selectedPosition,
    league: selectedLeague,
    sortBy,
    searchQuery,
    includeStats: true,
    statsFrom: 30,
  });

  console.log("Players page state:", {
    playersCount: players?.length || 0,
    loading,
    error,
    isEmpty,
    hasData,
  });

  // Position options based on your database data
  const positionOptions = [
    { id: "all", name: "All Positions" },
    ...positions.map((pos) => ({ id: pos, name: pos })),
  ];

  // League options based on your teams data
  const leagueOptions = [
    { id: "all", name: "All Leagues" },
    ...leagues.map((league) => ({ id: league, name: league })),
  ];

  const handlePlayerClick = (player) => {
    console.log("Player clicked:", player.full_name);

    if (!player) {
      console.error("No player data provided");
      return;
    }

    setSelectedPlayer(player);
    setShowPlayerModal(true);
  };

  const handleCloseModal = () => {
    setShowPlayerModal(false);
    setSelectedPlayer(null);
  };

  const handleAddDataClick = () => {
    console.log(
      "User wants to add data - you could redirect to documentation or scraper setup"
    );
  };

  // Loading state
  if (loading && players.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-red-950">
        <AnimatedBackground />
        <div className="relative z-10 min-h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin w-12 h-12 border-4 border-red-500 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-white text-lg">
              Loading players from database...
            </p>
            <p className="text-gray-400 text-sm mt-2">
              Checking your players table...
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-red-950">
        <AnimatedBackground />
        <div className="relative z-10 min-h-screen flex items-center justify-center">
          <div className="text-center max-w-md">
            <div className="text-red-400 text-6xl mb-4">!</div>
            <h2 className="text-2xl font-bold text-white mb-4">
              Database Connection Error
            </h2>
            <p className="text-gray-400 mb-6">{error}</p>
            <div className="space-y-3">
              <button
                onClick={refetch}
                className="px-6 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors block w-full"
              >
                Retry Connection
              </button>
              <p className="text-xs text-gray-500">
                Check your Supabase connection settings if this persists
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-red-950 text-white overflow-hidden relative">
      <AnimatedBackground />

      <div className="relative z-10">
        {/* Header */}
        <section
          className={`text-center pt-12 pb-8 px-4 transition-all duration-1000 ${
            isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          <h1 className="font-black text-6xl md:text-7xl mb-4 text-red-500">
            Players
          </h1>
          <p className="text-xl md:text-2xl text-gray-300 font-light tracking-wider">
            Football player database and statistics
          </p>

          {/* Database Stats */}
          <div className="flex justify-center space-x-8 mt-8 text-sm">
            <div className="text-center">
              <div className="text-2xl font-bold text-red-400">{total}</div>
              <div className="text-gray-400">Players in DB</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-400">
                {leagues.length}
              </div>
              <div className="text-gray-400">Countries</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-400">
                {positions.length}
              </div>
              <div className="text-gray-400">Positions</div>
            </div>
          </div>
        </section>

        {/* Top Players Section - Only show if we have data */}
        {hasData &&
          (topScorers.length > 0 ||
            topAssists.length > 0 ||
            topRated.length > 0) && (
            <section
              className={`max-w-6xl mx-auto px-4 mb-8 transition-all duration-700 delay-200 ${
                isLoaded
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-8"
              }`}
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                {/* Top Scorer */}
                {topScorers[0] && (
                  <div className="bg-white/5 backdrop-blur-sm rounded-lg p-4 border border-red-500/30">
                    <div className="flex items-center space-x-2 mb-2">
                      <Target className="w-5 h-5 text-red-400" />
                      <span className="text-sm font-semibold text-red-400">
                        Top Scorer
                      </span>
                    </div>
                    <div className="text-lg font-bold text-white">
                      {topScorers[0].full_name}
                    </div>
                    <div className="text-2xl font-black text-red-400">
                      {topScorers[0].stats.goals} goals
                    </div>
                    {topScorers[0].teams && (
                      <div className="text-sm text-gray-400">
                        {topScorers[0].teams.name}
                      </div>
                    )}
                  </div>
                )}

                {/* Top Assists */}
                {topAssists[0] && (
                  <div className="bg-white/5 backdrop-blur-sm rounded-lg p-4 border border-blue-500/30">
                    <div className="flex items-center space-x-2 mb-2">
                      <TrendingUp className="w-5 h-5 text-blue-400" />
                      <span className="text-sm font-semibold text-blue-400">
                        Top Assists
                      </span>
                    </div>
                    <div className="text-lg font-bold text-white">
                      {topAssists[0].full_name}
                    </div>
                    <div className="text-2xl font-black text-blue-400">
                      {topAssists[0].stats.assists} assists
                    </div>
                    {topAssists[0].teams && (
                      <div className="text-sm text-gray-400">
                        {topAssists[0].teams.name}
                      </div>
                    )}
                  </div>
                )}

                {/* Top Rated */}
                {topRated[0] && (
                  <div className="bg-white/5 backdrop-blur-sm rounded-lg p-4 border border-yellow-500/30">
                    <div className="flex items-center space-x-2 mb-2">
                      <Award className="w-5 h-5 text-yellow-400" />
                      <span className="text-sm font-semibold text-yellow-400">
                        Highest Rated
                      </span>
                    </div>
                    <div className="text-lg font-bold text-white">
                      {topRated[0].full_name}
                    </div>
                    <div className="text-2xl font-black text-yellow-400">
                      {topRated[0].stats.rating} rating
                    </div>
                    {topRated[0].teams && (
                      <div className="text-sm text-gray-400">
                        {topRated[0].teams.name}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>
          )}

        {/* Filters - Only show if we have data */}
        {hasData && (
          <div
            className={`max-w-6xl mx-auto px-4 mb-8 space-y-6 transition-all duration-700 delay-300 ${
              isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}
          >
            {/* Position Filters */}
            {positions.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-white flex items-center space-x-2">
                  <Filter className="w-5 h-5" />
                  <span>Position</span>
                </h3>
                <div className="flex gap-2 flex-wrap">
                  {positionOptions.map((position) => (
                    <PillButton
                      key={position.id}
                      active={selectedPosition === position.id}
                      onClick={() => setSelectedPosition(position.id)}
                      size="sm"
                    >
                      {position.name}
                    </PillButton>
                  ))}
                </div>
              </div>
            )}

            {/* League Filters */}
            {leagues.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-white">
                  Country/League
                </h3>
                <div className="flex gap-2 flex-wrap">
                  {leagueOptions.map((league) => (
                    <PillButton
                      key={league.id}
                      active={selectedLeague === league.id}
                      onClick={() => setSelectedLeague(league.id)}
                      size="sm"
                    >
                      {league.name}
                    </PillButton>
                  ))}
                </div>
              </div>
            )}

            {/* Search & Sort */}
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search players..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-lg bg-white/10 backdrop-blur-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500/50 border border-white/20"
                />
              </div>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-4 py-3 rounded-lg bg-white/10 backdrop-blur-sm text-white focus:outline-none focus:ring-2 focus:ring-red-500/50 border border-white/20"
              >
                <option value="name" className="bg-gray-900">
                  Sort by Name
                </option>
                <option value="rating" className="bg-gray-900">
                  Sort by Rating
                </option>
                <option value="goals" className="bg-gray-900">
                  Sort by Goals
                </option>
                <option value="assists" className="bg-gray-900">
                  Sort by Assists
                </option>
                <option value="team" className="bg-gray-900">
                  Sort by Team
                </option>
              </select>
            </div>
          </div>
        )}

        {/* Main Content */}
        <div
          className={`max-w-6xl mx-auto px-4 pb-8 transition-all duration-700 delay-500 ${
            isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          {isEmpty ? (
            <EmptyStateMessage onAddData={handleAddDataClick} />
          ) : players.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-6xl mb-4">
                <Users className="w-16 h-16 mx-auto text-gray-400 opacity-50" />
              </div>
              <h3 className="text-2xl font-bold mb-2">
                No Players Match Your Filters
              </h3>
              <p className="text-gray-400 mb-6">
                {searchQuery
                  ? `No players found for "${searchQuery}"`
                  : "Try adjusting your filters to see more players"}
              </p>
              <button
                onClick={() => {
                  setSearchQuery("");
                  setSelectedPosition("all");
                  setSelectedLeague("all");
                }}
                className="px-6 py-3 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors"
              >
                Clear All Filters
              </button>
            </div>
          ) : (
            <>
              {/* Results count */}
              <div className="mb-6 text-center">
                <p className="text-gray-400">
                  Showing{" "}
                  <span className="text-white font-semibold">
                    {players.length}
                  </span>
                  {total !== players.length && (
                    <span>
                      {" "}
                      of{" "}
                      <span className="text-white font-semibold">{total}</span>
                    </span>
                  )}
                  players from your database
                </p>
              </div>

              {/* Players Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {players.map((player) => (
                  <PlayerCard
                    key={player.id}
                    player={player}
                    onClick={handlePlayerClick}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Player Detail Modal */}
      {showPlayerModal && selectedPlayer && (
        <PlayerDetailModal player={selectedPlayer} onClose={handleCloseModal} />
      )}
    </div>
  );
}
