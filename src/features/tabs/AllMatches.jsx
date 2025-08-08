// src/features/tabs/AllMatches.jsx - S NAVIGACIJOM NA LIVE TAB
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import useMatchesByDate from "../../hooks/useMatchesByDate";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";
import CalendarPopover from "./CalendarPopover";
import MatchCard from "../../ui/MatchCard";
import {
  getValidLiveMatches,
  findProblemMatches,
} from "../../utils/matchStatusUtils";

export default function AllMatches() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const { matches, loading, backgroundRefreshing, refetch } =
    useMatchesByDate(selectedDate);
  const [, setCurrentTime] = useState(new Date());
  const navigate = useNavigate();

  // Auto-refresh callback
  const handleAutoRefresh = useCallback(() => {
    if (refetch) {
      refetch();
    }
  }, [refetch]);

  // Omogući auto-refresh za live utakmice (svakih 30 sekundi)
  useAutoRefresh(matches, handleAutoRefresh, 30000);

  // Ažuriranje vremena svake sekunde za validne live utakmice (za UI)
  useEffect(() => {
    const validLiveMatches = getValidLiveMatches(matches);

    if (validLiveMatches.length > 0) {
      console.log(
        `🔴 Found ${validLiveMatches.length} valid live matches - starting UI timer`
      );

      const interval = setInterval(() => {
        setCurrentTime(new Date());
      }, 1000);

      return () => clearInterval(interval);
    } else {
      console.log("✅ No live matches found - stopping UI timer");
    }
  }, [matches]);

  // Debugiranje problematičnih utakmica u development modu
  useEffect(() => {
    if (import.meta.env.DEV) {
      const problemMatches = findProblemMatches(matches);

      if (problemMatches.length > 0) {
        console.group("🚨 PROBLEM MATCHES DETECTED");
        problemMatches.forEach((match) => {
          const hoursElapsed = (
            (new Date() - new Date(match.start_time)) /
            (1000 * 60 * 60)
          ).toFixed(1);

          console.warn(`${match.home_team} vs ${match.away_team}`, {
            status: match.status,
            startTime: match.start_time,
            minute: match.minute,
            hoursElapsed,
          });
        });
        console.groupEnd();
      }
    }
  }, [matches]);

  // 🔧 NOVO: Handle click na live matches indicator
  const handleLiveMatchesClick = () => {
    console.log("🔄 Navigating to live matches tab");
    navigate("/matches/live"); // ili navigiraj na odgovarajući route
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-muted rounded-3xl p-1">
        <div className="flex justify-center my-4 gap-4">
          <CalendarPopover date={selectedDate} setDate={setSelectedDate} />
        </div>
        <p className="text-center text-foreground mt-6 font-black text-2xl">
          Loading...
        </p>
      </div>
    );
  }

  // Empty state
  if (matches.length === 0) {
    return (
      <div className="min-h-screen bg-muted rounded-3xl p-1">
        <div className="flex justify-center my-4 gap-4">
          <CalendarPopover date={selectedDate} setDate={setSelectedDate} />
        </div>
        <p className="text-center text-foreground mt-6 font-black text-2xl">
          No matches on this day.
        </p>
      </div>
    );
  }

  const liveMatchesCount = getValidLiveMatches(matches).length;

  // Main render
  return (
    <div className="min-h-screen bg-muted rounded-3xl p-1">
      {/* Calendar selector */}
      <div className="flex justify-center my-4 gap-4">
        <CalendarPopover date={selectedDate} setDate={setSelectedDate} />
      </div>

      {/* 🔧 POBOLJŠANI: Live matches indicator s navigation */}
      {liveMatchesCount > 0 && (
        <div className="flex justify-center mb-4">
          <button
            onClick={handleLiveMatchesClick}
            className="bg-red-600 text-white px-4 py-2 rounded-full text-sm font-medium flex items-center hover:bg-red-700 transition-colors group cursor-pointer"
          >
            <div
              className={`w-2 h-2 bg-white rounded-full mr-2 ${
                backgroundRefreshing ? "animate-spin" : "animate-pulse"
              }`}
            ></div>
            {liveMatchesCount} Live{" "}
            {liveMatchesCount === 1 ? "Match" : "Matches"}
            {backgroundRefreshing && (
              <span className="ml-2 text-xs opacity-75">Updating...</span>
            )}
            {/* 🔧 NOVO: Click indicator */}
            <span className="ml-2 text-xs opacity-75 group-hover:opacity-100 transition-opacity">
              👆 Click to view
            </span>
          </button>
        </div>
      )}

      {/* Matches grid */}
      <ul className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-6xl mx-auto">
        {matches.map((match) => (
          <MatchCard key={match.id} match={match} />
        ))}
      </ul>

      {/* Debug summary for development */}
      {import.meta.env.DEV && (
        <div className="mt-6 p-3 bg-gray-800 rounded text-xs text-center max-w-4xl mx-auto">
          <span className="text-gray-400">
            Debug: {matches.length} total •{" "}
            {getValidLiveMatches(matches).length} live •{" "}
            {findProblemMatches(matches).length} problems
          </span>
          {liveMatchesCount > 0 && (
            <span
              className={`ml-2 ${
                backgroundRefreshing ? "text-yellow-400" : "text-green-400"
              }`}
            >
              • Auto-refresh: ON (30s){" "}
              {backgroundRefreshing && "- Refreshing..."}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
