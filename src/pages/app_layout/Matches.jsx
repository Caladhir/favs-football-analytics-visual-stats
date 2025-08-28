// src/pages/app_layout/Matches.jsx - REDESIGNED WITH HOMEPAGE STYLING
import { useState, useEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useLiveMatches } from "../../hooks/useLiveMatches";
import AnimatedBackground from "../../features/homepage/AnimatedBackground";

import AllMatches from "../../features/tabs/AllMatches";
import LiveMatches from "../../features/tabs/LiveMatches";
import UpcomingMatches from "../../features/tabs/UpcomingMatches";
import FinishedMatches from "../../features/tabs/FinishedMatches";

const TABS = {
  all: {
    component: AllMatches,
    label: "All",
    icon: "📅",
    color: "from-gray-500/20 to-gray-600/30",
  },
  live: {
    component: LiveMatches,
    label: "Live",
    icon: "🔴",
    color: "from-red-500/20 to-red-600/30",
  },
  upcoming: {
    component: UpcomingMatches,
    label: "Upcoming",
    icon: "⏰",
    color: "from-blue-500/20 to-blue-600/30",
  },
  finished: {
    component: FinishedMatches,
    label: "Finished",
    icon: "✅",
    color: "from-green-500/20 to-green-600/30",
  },
};

export default function Matches() {
  const location = useLocation();
  const navigate = useNavigate();
  const isFirstRender = useRef(true);
  const [loadedTabs, setLoadedTabs] = useState(new Set());
  const [isLoaded, setIsLoaded] = useState(false);

  const { matches: liveMatches } = useLiveMatches();

  const liveMatchesCount = useMemo(() => {
    const count = liveMatches?.length || 0;

    if (import.meta.env.DEV) {
      console.log(`🔴 Live count for header: ${count} matches`);
      if (count > 0) {
        console.log(
          "Live matches:",
          liveMatches
            .slice(0, 3)
            .map((m) => `${m.home_team} vs ${m.away_team} (${m.status})`)
        );
      }
    }

    return count;
  }, [liveMatches]);

  const getCurrentTab = () => {
    const path = location.pathname;
    if (path.includes("/matches/live")) return "live";
    if (path.includes("/matches/upcoming")) return "upcoming";
    if (path.includes("/matches/finished")) return "finished";
    return "all";
  };

  const [tab, setTab] = useState(() => getCurrentTab());

  const handleTabChange = (newTab) => {
    console.log("🔥 Tab change:", tab, "→", newTab);

    setLoadedTabs((prev) => new Set([...prev, newTab]));
    setTab(newTab);

    const newPath = newTab === "all" ? "/matches" : `/matches/${newTab}`;
    navigate(newPath, { replace: true });
  };

  useEffect(() => {
    const currentTab = getCurrentTab();
    if (currentTab !== tab) {
      console.log("🔥 Updating tab state:", tab, "→", currentTab);
      setTab(currentTab);
      setLoadedTabs((prev) => new Set([...prev, currentTab]));
    }
  }, [location.pathname]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      setLoadedTabs(new Set([tab]));

      if (liveMatchesCount > 0 && tab !== "live") {
        const timer = setTimeout(() => {
          setLoadedTabs((prev) => new Set([...prev, "live"]));
        }, 2000);
        return () => clearTimeout(timer);
      }
    }
  }, [tab, liveMatchesCount]);

  useEffect(() => {
    setIsLoaded(true);
  }, []);

  const renderTabButton = (key, { label, icon, color }) => {
    const isActive = tab === key;
    const showLiveCount = key === "live" && liveMatchesCount > 0;

    return (
      <button
        key={key}
        onClick={() => handleTabChange(key)}
        className={`
          group relative px-6 py-4 rounded-2xl font-semibold transition-all duration-300 ease-out
          transform hover:scale-105 active:scale-95 hover:shadow-2xl
          flex items-center gap-3 min-w-[140px] justify-center
          ${
            isActive
              ? "bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg shadow-red-500/25 border border-red-400/50"
              : `bg-gradient-to-br ${color} backdrop-blur-sm text-gray-300 hover:text-white border border-white/10 hover:border-red-500/40`
          }
        `}
      >
        {/* Background glow effect */}
        <div
          className={`absolute inset-0 rounded-2xl transition-opacity duration-300 ${
            isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          } bg-gradient-to-r from-red-500/20 to-red-600/20 blur-xl -z-10`}
        />

        <span className="relative flex items-center gap-3">
          <span
            className={`text-xl transition-all duration-300 ${
              isActive ? "scale-110 animate-pulse" : "group-hover:scale-110"
            }`}
          >
            {icon}
          </span>
          <span className="font-bold">{label}</span>
          {showLiveCount && (
            <span className="bg-white text-red-600 text-xs px-2 py-1 rounded-full animate-pulse font-bold shadow-lg">
              {liveMatchesCount}
            </span>
          )}
        </span>

        {isActive && <div className="" />}
      </button>
    );
  };

  const renderActiveTab = () => {
    const isLoaded = loadedTabs.has(tab);
    if (!isLoaded) {
      return (
        <div className="flex justify-center items-center min-h-[400px]">
          <div className="text-center">
            <div className="relative">
              <div className="animate-spin w-12 h-12 border-4 border-red-500/30 border-t-red-500 rounded-full mx-auto mb-4"></div>
              <div className="absolute inset-0 animate-ping w-12 h-12 border-4 border-red-500/20 rounded-full mx-auto opacity-20"></div>
            </div>
            <p className="text-gray-300 font-semibold">
              Loading {tab} matches...
            </p>
            <p className="text-gray-500 text-sm mt-2">Fetching latest data</p>
          </div>
        </div>
      );
    }

    switch (tab) {
      case "live":
        return <LiveMatches />;
      case "upcoming":
        return <UpcomingMatches />;
      case "finished":
        return <FinishedMatches />;
      case "all":
      default:
        return <AllMatches />;
    }
  };

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log("⚽ Matches.jsx Debug Info:", {
        currentTab: tab,
        liveMatchesCount,
        totalLiveMatches: liveMatches?.length || 0,
      });
    }
  }, [tab, liveMatchesCount, liveMatches]);

  return (
    <main className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-red-950 text-white overflow-x-hidden relative ">
      <AnimatedBackground />

      {/* Hero Header */}
      <section
        className={`relative z-10 text-center pt-12 pb-8 px-6 transition-all duration-1000 ${
          isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
        }`}
      >
        <div className="mb-8">
          <h1 className="font-black text-6xl md:text-7xl mb-4 text-red-500 animate-pulse-slow">
            Matches
          </h1>
          <p className="text-xl md:text-2xl text-gray-300 font-light tracking-wider mb-2">
            Football Analytics & Live Tracking
          </p>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto">
            Follow matches by status and get real-time updates
            {liveMatchesCount > 0 && (
              <span className="block mt-10 text-red-400 font-semibold animate-pulse">
                • {liveMatchesCount} Live Now
              </span>
            )}
          </p>
        </div>
      </section>

      {/* Enhanced Tab Navigation */}
      <div
        className={`relative z-10 flex justify-center px-6 mb-8 transition-all duration-700 delay-300 ${
          isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
        }`}
      >
        <div className="flex flex-wrap justify-center gap-4 p-4 bg-gradient-to-r from-black/40 via-gray-900/60 to-black/40 backdrop-blur-sm rounded-3xl border border-red-500/20 shadow-2xl">
          {Object.entries(TABS).map(([key, tabInfo]) =>
            renderTabButton(key, tabInfo)
          )}
        </div>
      </div>

      {/* Content Area */}
      <div
        className={`relative z-10 px-6 transition-all duration-700 delay-500 ${
          isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
        }`}
      >
        <div className="max-w-7xl mx-auto">{renderActiveTab()}</div>
      </div>
    </main>
  );
}
