import { useState, useEffect } from "react";
import { Icon } from "@iconify-icon/react";

export default function Teams() {
  const [selectedLeague, setSelectedLeague] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const leagues = [
    { id: "all", name: "All Leagues", icon: "🌍" },
    { id: "premier", name: "Premier League", icon: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
    { id: "laliga", name: "La Liga", icon: "🇪🇸" },
    { id: "seriea", name: "Serie A", icon: "🇮🇹" },
    { id: "bundesliga", name: "Bundesliga", icon: "🇩🇪" },
    { id: "ligue1", name: "Ligue 1", icon: "🇫🇷" },
    { id: "hnl", name: "HNL", icon: "🇭🇷" },
  ];

  // Mock data - replace with real data later
  const mockTeams = [
    {
      id: 1,
      name: "Arsenal FC",
      league: "premier",
      logo: "🔴",
      country: "England",
      rating: 85,
    },
    {
      id: 2,
      name: "Real Madrid",
      league: "laliga",
      logo: "⚪",
      country: "Spain",
      rating: 90,
    },
    {
      id: 3,
      name: "AC Milan",
      league: "seriea",
      logo: "🔴",
      country: "Italy",
      rating: 82,
    },
    {
      id: 4,
      name: "Bayern Munich",
      league: "bundesliga",
      logo: "🔴",
      country: "Germany",
      rating: 88,
    },
    {
      id: 5,
      name: "PSG",
      league: "ligue1",
      logo: "🔵",
      country: "France",
      rating: 86,
    },
    {
      id: 6,
      name: "Dinamo Zagreb",
      league: "hnl",
      logo: "🔵",
      country: "Croatia",
      rating: 75,
    },
  ];

  const filteredTeams = mockTeams.filter((team) => {
    const matchesLeague =
      selectedLeague === "all" || team.league === selectedLeague;
    const matchesSearch = team.name
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    return matchesLeague && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <section className="text-center mt-6 mb-8">
        <h1 className="text-4xl font-black text-primary text-outline">Teams</h1>
        <p className="text-muted-foreground mt-2">
          Football team profiles and statistics
        </p>
      </section>

      {/* Controls */}
      <div className="max-w-6xl mx-auto px-4 mb-8">
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
          {/* League filter */}
          <div className="flex gap-2 flex-wrap">
            {leagues.map((league) => (
              <button
                key={league.id}
                onClick={() => setSelectedLeague(league.id)}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  selectedLeague === league.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-primary/10"
                }`}
              >
                <span className="mr-2">{league.icon}</span>
                {league.name}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative">
            <Icon
              icon="mdi:magnify"
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground"
              width={20}
            />
            <input
              type="text"
              placeholder="Search teams..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 rounded-lg bg-muted text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>
      </div>

      {/* Teams Grid */}
      <div className="max-w-6xl mx-auto px-4">
        {filteredTeams.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🏆</div>
            <p className="text-xl font-bold mb-2">No teams found</p>
            <p className="text-muted-foreground">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTeams.map((team) => (
              <div
                key={team.id}
                className="bg-card border border-border rounded-lg p-6 hover:shadow-lg transition-all cursor-pointer hover:scale-105"
              >
                <div className="text-center">
                  <div className="text-4xl mb-4">{team.logo}</div>
                  <h3 className="text-xl font-bold mb-2">{team.name}</h3>
                  <p className="text-muted-foreground mb-4">{team.country}</p>

                  <div className="flex items-center justify-center gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-primary">
                        {team.rating}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Rating
                      </div>
                    </div>
                  </div>

                  <button className="mt-4 w-full bg-primary text-primary-foreground py-2 rounded-lg hover:bg-primary/90 transition-colors">
                    View Details
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
            Team statistics, squad information, performance analytics, and much
            more!
          </p>
        </div>
      </div>
    </div>
  );
}
