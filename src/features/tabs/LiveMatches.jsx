// src/features/tabs/LiveMatches.jsx - S DEBUG INFORMACIJAMA
import { useState, useEffect, useCallback } from "react";
import supabase from "../../services/supabase";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";
import MatchCard from "../../ui/MatchCard";
import {
  getValidLiveMatches,
  findProblemMatches,
  debugBackendMinutes,
} from "../../utils/matchStatusUtils";

export default function LiveMatches() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [backgroundRefreshing, setBackgroundRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [, setCurrentTime] = useState(new Date());

  // Funkcija za dohvaćanje samo live utakmica iz baze
  const fetchLiveMatches = useCallback(async (isBackgroundRefresh = false) => {
    try {
      if (!isBackgroundRefresh) {
        setLoading(true);
      } else {
        setBackgroundRefreshing(true);
      }

      setError(null);

      const { data, error: fetchError } = await supabase
        .from("matches")
        .select(
          `
          id,
          home_team,
          away_team,
          home_score,
          away_score,
          start_time,
          status,
          status_type,
          competition,
          competition_id,
          season,
          round,
          venue,
          minute,
          home_color,
          away_color,
          current_period_start,
          source,
          updated_at
        `
        )
        .in("status", ["live", "ht", "inprogress", "halftime"])
        .order("start_time", { ascending: false }); // Najnovije prvo

      if (fetchError) {
        throw fetchError;
      }

      // Filtriraj samo validne live utakmice (ukloni zombie utakmice)
      const validLiveMatches = getValidLiveMatches(data || []);

      setMatches(validLiveMatches);

      // 🔧 DEBUG: Analiziraj kvalitetu backend podataka
      if (validLiveMatches.length > 0) {
        console.group("🔍 LIVE MATCHES DEBUG");
        console.log(`Found ${validLiveMatches.length} live matches`);

        // Provjeri minute za svaku utakmicu
        validLiveMatches.forEach((match, index) => {
          const now = new Date();
          const startTime = new Date(match.start_time);
          const minutesFromStart = Math.floor((now - startTime) / (1000 * 60));

          console.log(
            `${index + 1}. ${match.home_team} vs ${match.away_team}:`
          );
          console.log(`   Backend minute: ${match.minute || "NULL"}`);
          console.log(`   Real minutes from start: ${minutesFromStart}'`);
          console.log(`   Status: ${match.status}`);
          console.log(`   Updated at: ${match.updated_at}`);

          // Provjeri jesu li sve utakmice iste minute (što je sumnjivo)
          if (index > 0 && match.minute === validLiveMatches[0].minute) {
            console.warn(
              `   ⚠️ Same minute as first match - possible scraper issue!`
            );
          }
        });

        debugBackendMinutes(validLiveMatches);
        console.groupEnd();
      }

      if (isBackgroundRefresh) {
        console.log(
          `🔄 Live matches refresh: ${validLiveMatches.length} matches`
        );
      }
    } catch (err) {
      console.error("Error fetching live matches:", err);
      setError(err.message);
      if (!isBackgroundRefresh) {
        setMatches([]);
      }
    } finally {
      setLoading(false);
      setBackgroundRefreshing(false);
    }
  }, []);

  // Inicijalno dohvaćanje
  useEffect(() => {
    fetchLiveMatches(false);
  }, [fetchLiveMatches]);

  // Auto-refresh callback
  const handleAutoRefresh = useCallback(() => {
    fetchLiveMatches(true); // Background refresh
  }, [fetchLiveMatches]);

  // Omogući auto-refresh (svakih 30 sekundi kad ima live utakmica)
  useAutoRefresh(matches, handleAutoRefresh, 30000);

  // UI timer za live minute (svaku sekundu)
  useEffect(() => {
    if (matches.length > 0) {
      console.log(
        `🔴 Live Matches Tab: ${matches.length} live matches - starting UI timer`
      );

      const interval = setInterval(() => {
        setCurrentTime(new Date());
      }, 1000);

      return () => clearInterval(interval);
    } else {
      console.log("✅ Live Matches Tab: No live matches - stopping UI timer");
    }
  }, [matches]);

  // Debug problematičnih utakmica
  useEffect(() => {
    if (import.meta.env.DEV && matches.length > 0) {
      const problemMatches = findProblemMatches(matches);

      if (problemMatches.length > 0) {
        console.group("🚨 LIVE TAB - PROBLEM MATCHES");
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

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-muted rounded-3xl p-1">
        <div className="flex justify-center my-4">
          <div className="bg-red-600 text-white px-4 py-2 rounded-full text-sm font-medium">
            🔄 Loading live matches...
          </div>
        </div>
        <p className="text-center text-foreground mt-6 font-black text-2xl">
          Loading...
        </p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-muted rounded-3xl p-1">
        <div className="flex justify-center my-4">
          <div className="bg-red-600 text-white px-4 py-2 rounded-full text-sm font-medium">
            ❌ Error loading live matches
          </div>
        </div>
        <p className="text-center text-foreground mt-6 text-lg">
          Error: {error}
        </p>
        <div className="flex justify-center mt-4">
          <button
            onClick={() => fetchLiveMatches(false)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Empty state
  if (matches.length === 0) {
    return (
      <div className="min-h-screen bg-muted rounded-3xl p-1">
        <div className="flex justify-center my-4">
          <div className="bg-gray-600 text-white px-4 py-2 rounded-full text-sm font-medium">
            📺 Live Matches
          </div>
        </div>

        <div className="text-center mt-12">
          <div className="text-6xl mb-4">⚽</div>
          <p className="text-foreground font-black text-2xl mb-2">
            No Live Matches
          </p>
          <p className="text-muted-foreground">
            There are currently no live football matches.
          </p>
          <p className="text-muted-foreground text-sm mt-2">
            Check back later or view all matches for today.
          </p>

          <button
            onClick={() => fetchLiveMatches(false)}
            className="mt-6 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            🔄 Refresh
          </button>
        </div>
      </div>
    );
  }

  // Main render with live matches
  return (
    <div className="min-h-screen bg-muted rounded-3xl p-1">
      {/* Live matches header */}
      <div className="flex justify-center my-4">
        <div className="bg-red-600 text-white px-4 py-2 rounded-full text-sm font-medium flex items-center">
          <div
            className={`w-2 h-2 bg-white rounded-full mr-2 ${
              backgroundRefreshing ? "animate-spin" : "animate-pulse"
            }`}
          ></div>
          📺 {matches.length} Live {matches.length === 1 ? "Match" : "Matches"}
          {backgroundRefreshing && (
            <span className="ml-2 text-xs opacity-75">Updating...</span>
          )}
        </div>
      </div>

      {/* Subtitle */}
      <div className="text-center mb-6">
        <p className="text-muted-foreground text-sm">
          Live football matches happening right now
        </p>
      </div>

      {/* 🔧 DEBUG: Backend Data Quality Indicator */}
      {import.meta.env.DEV && matches.length > 0 && (
        <div className="flex justify-center mb-4">
          <div className="bg-gray-800 text-white px-3 py-1 rounded text-xs">
            🔍 Debug: Check console for backend data quality analysis
          </div>
        </div>
      )}

      {/* Matches grid */}
      <ul className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-6xl mx-auto">
        {matches.map((match) => (
          <MatchCard key={match.id} match={match} />
        ))}
      </ul>

      {/* Manual refresh button */}
      <div className="flex justify-center mt-8">
        <button
          onClick={() => fetchLiveMatches(false)}
          disabled={backgroundRefreshing}
          className={`px-6 py-2 rounded-lg font-medium transition-colors ${
            backgroundRefreshing
              ? "bg-gray-600 text-gray-300 cursor-not-allowed"
              : "bg-blue-600 text-white hover:bg-blue-700"
          }`}
        >
          {backgroundRefreshing ? "🔄 Refreshing..." : "🔄 Manual Refresh"}
        </button>
      </div>

      {/* Debug summary for development */}
      {import.meta.env.DEV && (
        <div className="mt-6 p-3 bg-gray-800 rounded text-xs text-center max-w-4xl mx-auto">
          <span className="text-gray-400">
            Live Debug: {matches.length} live matches •{" "}
            {findProblemMatches(matches).length} problems
          </span>
          <span
            className={`ml-2 ${
              backgroundRefreshing ? "text-yellow-400" : "text-green-400"
            }`}
          >
            • Auto-refresh: ON (30s) {backgroundRefreshing && "- Refreshing..."}
          </span>
        </div>
      )}
    </div>
  );
}
