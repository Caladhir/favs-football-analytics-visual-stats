// src/pages/app_layout/Players.jsx
import { useState, useEffect } from "react";
import { Icon } from "@iconify-icon/react";

export default function Players() {
  const [selectedPosition, setSelectedPosition] = useState("all");
  const [selectedLeague, setSelectedLeague] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("rating");

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
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <section className="text-center mt-6 mb-8">
        <h1 className="text-4xl font-black text-primary text-outline">
          Players
        </h1>
        <p className="text-muted-foreground mt-2">
          Football player statistics and analysis
        </p>
      </section>

      {/* Controls */}
      <div className="max-w-6xl mx-auto px-4 mb-8 space-y-4">
        {/* Position & League filters */}
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Positions */}
          <div className="flex gap-2 flex-wrap">
            {positions.map((position) => (
              <button
                key={position.id}
                onClick={() => setSelectedPosition(position.id)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  selectedPosition === position.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-primary/10"
                }`}
              >
                <span className="mr-1">{position.icon}</span>
                {position.name}
              </button>
            ))}
          </div>

          {/* Leagues */}
          <div className="flex gap-2 flex-wrap">
            {leagues.map((league) => (
              <button
                key={league.id}
                onClick={() => setSelectedLeague(league.id)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  selectedLeague === league.id
                    ? "bg-purple-600 text-white"
                    : "bg-muted text-muted-foreground hover:bg-purple-100"
                }`}
              >
                {league.name}
              </button>
            ))}
          </div>
        </div>

        {/* Search & Sort */}
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="relative">
            <Icon
              icon="mdi:magnify"
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground"
              width={20}
            />
            <input
              type="text"
              placeholder="Search players or teams..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 rounded-lg bg-muted text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-4 py-2 rounded-lg bg-muted text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="rating">Sort by Rating</option>
            <option value="goals">Sort by Goals</option>
            <option value="assists">Sort by Assists</option>
            <option value="name">Sort by Name</option>
          </select>
        </div>
      </div>

      {/* Players Grid */}
      <div className="max-w-6xl mx-auto px-4">
        {sortedPlayers.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">⚽</div>
            <p className="text-xl font-bold mb-2">No players found</p>
            <p className="text-muted-foreground">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {sortedPlayers.map((player) => (
              <div
                key={player.id}
                className="bg-card border border-border rounded-lg p-4 hover:shadow-lg transition-all cursor-pointer hover:scale-105"
              >
                <div className="text-center">
                  <div className="text-3xl mb-2">{player.flag}</div>
                  <h3 className="text-lg font-bold mb-1">{player.name}</h3>
                  <p className="text-sm text-muted-foreground mb-2">
                    {player.team}
                  </p>

                  <div className="bg-muted rounded-lg p-3 mb-4">
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <div className="text-lg font-bold text-primary">
                          {player.rating}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Rating
                        </div>
                      </div>
                      <div>
                        <div className="text-lg font-bold text-green-600">
                          {player.goals}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Goals
                        </div>
                      </div>
                      <div>
                        <div className="text-lg font-bold text-blue-600">
                          {player.assists}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Assists
                        </div>
                      </div>
                    </div>
                  </div>

                  <button className="w-full bg-primary text-primary-foreground py-2 rounded-lg hover:bg-primary/90 transition-colors text-sm">
                    View Profile
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Coming Soon Banner */}
      <div className="max-w-6xl mx-auto px-4 mt-12">
        <div className="bg-muted rounded-lg p-8 text-center">
          <h3 className="text-2xl font-bold mb-2">🚀 Coming Soon</h3>
          <p className="text-muted-foreground">
            Detailed player statistics, performance charts, comparison tools,
            and advanced analytics!
          </p>
        </div>
      </div>
    </div>
  );
}
