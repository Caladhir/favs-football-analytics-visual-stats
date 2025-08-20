// src/pages/app_layout/Players.jsx - AŽURIRANO S NOVIM BUTTON KOMPONENTAMA
import { useState, useEffect } from "react";
import { Icon } from "@iconify-icon/react";

// Import novih button komponenti
import Button from "../../ui/Button";
import { PillButton } from "../../ui/SpecializedButtons";
import AnimatedBackground from "../../ui/AnimatedBackground";

export default function Players() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState("all");
  const [selectedLeague, setSelectedLeague] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("rating");

  useEffect(() => {
    const timer = setTimeout(() => setIsLoaded(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const positions = [
    { id: "all", name: "All Positions", icon: "⚽" },
    { id: "gk", name: "Goalkeeper", icon: "🥅" },
    { id: "def", name: "Defender", icon: "🛡️" },
    { id: "mid", name: "Midfielder", icon: "⚽" },
    { id: "att", name: "Attacker", icon: "🎯" },
  ];

  const leagues = [
    { id: "all", name: "All Leagues" },
    { id: "premier", name: "Premier League" },
    { id: "laliga", name: "La Liga" },
    { id: "seriea", name: "Serie A" },
    { id: "bundesliga", name: "Bundesliga" },
    { id: "hnl", name: "HNL" },
  ];

  // Mock data - replace with real data later
  const mockPlayers = [
    {
      id: 1,
      name: "Bruno Petković",
      position: "att",
      league: "hnl",
      team: "Dinamo Zagreb",
      rating: 82,
      goals: 15,
      assists: 6,
      flag: "🇭🇷",
    },
    {
      id: 2,
      name: "Marko Livaja",
      position: "att",
      league: "hnl",
      team: "Hajduk Split",
      rating: 79,
      goals: 12,
      assists: 4,
      flag: "🇭🇷",
    },
    {
      id: 3,
      name: "Luka Modrić",
      position: "mid",
      league: "laliga",
      team: "Real Madrid",
      rating: 88,
      goals: 3,
      assists: 8,
      flag: "🇭🇷",
    },
    {
      id: 4,
      name: "Bukayo Saka",
      position: "att",
      league: "premier",
      team: "Arsenal",
      rating: 86,
      goals: 10,
      assists: 12,
      flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
    },
  ];

  const filteredPlayers = mockPlayers.filter((player) => {
    const matchesPosition =
      selectedPosition === "all" || player.position === selectedPosition;
    const matchesLeague =
      selectedLeague === "all" || player.league === selectedLeague;
    const matchesSearch =
      player.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      player.team.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesPosition && matchesLeague && matchesSearch;
  });

  const sortedPlayers = [...filteredPlayers].sort((a, b) => {
    switch (sortBy) {
      case "rating":
        return b.rating - a.rating;
      case "goals":
        return b.goals - a.goals;
      case "assists":
        return b.assists - a.assists;
      case "name":
        return a.name.localeCompare(b.name);
      default:
        return 0;
    }
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-red-950 text-white overflow-hidden relative">
      {/* Shared AnimatedBackground */}
      <AnimatedBackground />

      <div className="relative z-10">
        {/* Header s animacijom */}
        <section
          className={`text-center pt-12 pb-8 px-4 transition-all duration-1000 ${
            isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          <h1 className="font-black text-6xl md:text-7xl mb-4 text-red-500 animate-pulse-slow">
            Players
          </h1>
          <p className="text-xl md:text-2xl text-gray-300 font-light tracking-wider">
            Football player statistics and analysis
          </p>
        </section>

        {/* Controls s novim button komponentama */}
        <div
          className={`max-w-6xl mx-auto px-4 mb-8 space-y-6 transition-all duration-700 delay-300 ${
            isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          {/* Position filters - koristi PillButton */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-white">Position</h3>
            <div className="flex gap-2 flex-wrap">
              {positions.map((position) => (
                <PillButton
                  key={position.id}
                  active={selectedPosition === position.id}
                  onClick={() => setSelectedPosition(position.id)}
                  size="sm"
                >
                  <span className="mr-1">{position.icon}</span>
                  {position.name}
                </PillButton>
              ))}
            </div>
          </div>

          {/* League filters - koristi PillButton */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-white">League</h3>
            <div className="flex gap-2 flex-wrap">
              {leagues.map((league) => (
                <PillButton
                  key={league.id}
                  active={selectedLeague === league.id}
                  onClick={() => setSelectedLeague(league.id)}
                  size="sm"
                  className={
                    selectedLeague === league.id ? "bg-purple-600" : ""
                  }
                >
                  {league.name}
                </PillButton>
              ))}
            </div>
          </div>

          {/* Search & Sort */}
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="relative">
              <Icon
                icon="mdi:magnify"
                className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                width={20}
              />
              <input
                type="text"
                placeholder="Search players or teams..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-3 rounded-lg bg-white/10 backdrop-blur-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500/50 border border-white/20"
              />
            </div>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-4 py-3 rounded-lg bg-white/10 backdrop-blur-sm text-white focus:outline-none focus:ring-2 focus:ring-red-500/50 border border-white/20"
            >
              <option value="rating" className="bg-gray-900">
                Sort by Rating
              </option>
              <option value="goals" className="bg-gray-900">
                Sort by Goals
              </option>
              <option value="assists" className="bg-gray-900">
                Sort by Assists
              </option>
              <option value="name" className="bg-gray-900">
                Sort by Name
              </option>
            </select>
          </div>
        </div>

        {/* Players Grid */}
        <div
          className={`max-w-6xl mx-auto px-4 transition-all duration-700 delay-500 ${
            isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          {sortedPlayers.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">⚽</div>
              <p className="text-xl font-bold mb-2">No players found</p>
              <p className="text-gray-400 mb-6">Try adjusting your filters</p>
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedPosition("all");
                  setSelectedLeague("all");
                  setSearchQuery("");
                }}
                leftIcon="mdi:filter-off"
              >
                Clear Filters
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {sortedPlayers.map((player, index) => (
                <div
                  key={player.id}
                  className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6 hover:shadow-xl transition-all duration-300 cursor-pointer hover:scale-105 hover:border-red-500/30 group"
                  style={{
                    animationDelay: `${index * 100}ms`,
                    animation: isLoaded
                      ? "fadeInUp 0.6s ease-out forwards"
                      : "none",
                  }}
                >
                  <div className="text-center">
                    <div className="text-3xl mb-3">{player.flag}</div>
                    <h3 className="text-lg font-bold mb-1 text-white group-hover:text-red-400 transition-colors">
                      {player.name}
                    </h3>
                    <p className="text-sm text-gray-400 mb-4">{player.team}</p>

                    <div className="bg-white/5 rounded-lg p-4 mb-4 border border-white/10">
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div>
                          <div className="text-lg font-bold text-red-400">
                            {player.rating}
                          </div>
                          <div className="text-xs text-gray-400">Rating</div>
                        </div>
                        <div>
                          <div className="text-lg font-bold text-green-400">
                            {player.goals}
                          </div>
                          <div className="text-xs text-gray-400">Goals</div>
                        </div>
                        <div>
                          <div className="text-lg font-bold text-blue-400">
                            {player.assists}
                          </div>
                          <div className="text-xs text-gray-400">Assists</div>
                        </div>
                      </div>
                    </div>

                    {/* Ažurirani View Profile button */}
                    <Button
                      variant="primary"
                      size="sm"
                      fullWidth
                      leftIcon="mdi:account"
                    >
                      View Profile
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Coming Soon Banner - ažurirano */}
        <div
          className={`max-w-6xl mx-auto px-4 mt-12 transition-all duration-700 delay-700 ${
            isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <div className="relative bg-gradient-to-r from-red-900/50 to-gray-900/50 rounded-2xl p-8 text-center border border-red-500/30 backdrop-blur-sm hover:border-red-500/50 transition-colors">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-red-500/20 to-white/10 rounded-2xl blur-sm opacity-50" />
            <div className="relative">
              <h3 className="text-3xl font-bold mb-4 bg-gradient-to-r from-red-400 to-white bg-clip-text text-transparent">
                🚀 Coming Soon
              </h3>
              <p className="text-gray-300 text-lg max-w-3xl mx-auto mb-6">
                Detailed player statistics, performance charts, comparison
                tools, and advanced analytics!
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button variant="outline" leftIcon="mdi:bell-outline">
                  Notify Me
                </Button>
                <Button variant="ghost" leftIcon="mdi:lightbulb-outline">
                  Suggest Feature
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
