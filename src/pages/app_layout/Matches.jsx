// src/pages/app_layout/Matches.jsx - ISPRAVKA TAB NAVIGACIJE
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getValidLiveMatches } from "../../utils/matchStatusUtils";
import useMatchesByDate from "../../hooks/useMatchesByDate";

// Tab komponente
import AllMatches from "../../features/tabs/AllMatches";
import LiveMatches from "../../features/tabs/LiveMatches";
import UpcomingMatches from "../../features/tabs/UpcomingMatches";
import FinishedMatches from "../../features/tabs/FinishedMatches";

const TABS = {
  all: { component: AllMatches, label: "All", icon: "📅" },
  live: { component: LiveMatches, label: "Live", icon: "🔴" },
  upcoming: { component: UpcomingMatches, label: "Upcoming", icon: "⏰" },
  finished: { component: FinishedMatches, label: "Finished", icon: "✅" },
};

export default function Matches() {
  const location = useLocation();
  const navigate = useNavigate();
  const isFirstRender = useRef(true);
  const [loadedTabs, setLoadedTabs] = useState(new Set());

  // Get today's matches za live count
  const { matches: todayMatches } = useMatchesByDate(new Date());
  const liveMatchesCount = useMemo(() => {
    return getValidLiveMatches(todayMatches || []).length;
  }, [todayMatches]);

  // 🔧 ISPRAVKA: Ukloni useCallback i koristi jednostavniju logiku
  const getCurrentTab = () => {
    const path = location.pathname;
    console.log("🔍 Current path:", path); // Debug log

    if (path.includes("/matches/live")) return "live";
    if (path.includes("/matches/upcoming")) return "upcoming";
    if (path.includes("/matches/finished")) return "finished";
    return "all";
  };

  const [tab, setTab] = useState(() => {
    const currentTab = getCurrentTab();
    console.log("🔍 Initial tab:", currentTab); // Debug log
    return currentTab;
  });

  const handleTabChange = (newTab) => {
    console.log("🔄 Tab change:", tab, "→", newTab); // Debug log

    setLoadedTabs((prev) => new Set([...prev, newTab]));
    setTab(newTab);

    const newPath = newTab === "all" ? "/matches" : `/matches/${newTab}`;
    navigate(newPath, { replace: true });
  };

  useEffect(() => {
    const currentTab = getCurrentTab();
    console.log("🔍 Location changed - current tab should be:", currentTab);

    if (currentTab !== tab) {
      console.log("🔄 Updating tab state:", tab, "→", currentTab);
      setTab(currentTab);
      setLoadedTabs((prev) => new Set([...prev, currentTab]));
    }
  }, [location.pathname]);

  // Pre-load tab-ove
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

  console.log("🔍 Current tab state:", tab, "| Path:", location.pathname);

  const renderTabButton = (key, { label, icon }) => {
    const isActive = tab === key;
    const showLiveCount = key === "live" && liveMatchesCount > 0;

    return (
      <button
        key={key}
        onClick={() => handleTabChange(key)}
        className={`
          relative px-5 py-3 rounded-xl font-semibold transition-all duration-200 ease-out
          transform hover:scale-105 active:scale-95
          flex items-center gap-3 min-w-[120px] justify-center
          ${
            isActive
              ? "bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/25"
              : "bg-muted text-muted-foreground hover:bg-primary/10 hover:text-foreground"
          }
        `}
      >
        {isActive && (
          <span className="absolute inset-0 bg-white/10 rounded-xl animate-pulse" />
        )}

        <span className="relative flex items-center gap-2">
          <span
            className={`text-lg transition-transform duration-200 ${
              isActive ? "scale-110" : ""
            }`}
          >
            {icon}
          </span>
          <span>{label}</span>
          {showLiveCount && (
            <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full animate-pulse font-bold shadow-lg">
              {liveMatchesCount}
            </span>
          )}
        </span>

        {isActive && (
          <span className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-primary-foreground rounded-full shadow-lg" />
        )}
      </button>
    );
  };

  // Render komponente
  const renderActiveTab = () => {
    const isLoaded = loadedTabs.has(tab);
    if (!isLoaded) {
      return (
        <div className="flex justify-center items-center min-h-[200px]">
          <div className="text-center">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-2"></div>
            <p className="text-muted-foreground">Loading {tab} matches...</p>
          </div>
        </div>
      );
    }

    // Direktan pristup komponenti
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

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <section className="text-center mt-6 mb-2">
        <h1 className="text-4xl font-black text-primary text-outline">
          Matches
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Follow matches by status
          {liveMatchesCount > 0 && (
            <span className="ml-2 text-red-500 font-medium">
              • {liveMatchesCount} Live Now
            </span>
          )}
        </p>
      </section>

      {/* Tab navigation */}
      <div className="flex justify-center gap-3 mt-8 mb-6 px-4">
        <div className="flex gap-2 p-2 bg-muted/50 rounded-2xl backdrop-blur-sm">
          {Object.entries(TABS).map(([key, tabInfo]) =>
            renderTabButton(key, tabInfo)
          )}
        </div>
      </div>

      {/* 🔧 DEBUG: Prikaz trenutnog stanja */}
      {import.meta.env.DEV && (
        <div className="fixed top-4 right-4 bg-black text-white p-2 rounded text-xs z-50">
          <div>Tab: {tab}</div>
          <div>Path: {location.pathname}</div>
          <div>Loaded: {Array.from(loadedTabs).join(", ")}</div>
        </div>
      )}

      {/* Active tab content */}
      <div className="relative">{renderActiveTab()}</div>
    </div>
  );
}
