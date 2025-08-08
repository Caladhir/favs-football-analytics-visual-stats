// src/hooks/useMatchesByDate.js - AŽURIRANO S BACKGROUND REFRESH
import { useState, useEffect, useCallback } from "react";
import supabase from "../services/supabase";

export default function useMatchesByDate(selectedDate) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [backgroundRefreshing, setBackgroundRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Funkcija za dohvaćanje utakmica
  const fetchMatches = useCallback(
    async (isBackgroundRefresh = false) => {
      try {
        // Ako je background refresh, ne pokazuj loading
        if (!isBackgroundRefresh) {
          setLoading(true);
        } else {
          setBackgroundRefreshing(true);
        }

        setError(null);

        // Format date za API poziv
        const dateStr = selectedDate.toISOString().split("T")[0];

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
          .gte("start_time", `${dateStr}T00:00:00Z`)
          .lt("start_time", `${dateStr}T23:59:59Z`)
          .order("start_time", { ascending: true });

        if (fetchError) {
          throw fetchError;
        }

        setMatches(data || []);

        // Log za debug background refresh
        if (isBackgroundRefresh) {
          console.log(
            `🔄 Background refresh completed: ${data?.length || 0} matches`
          );
        }
      } catch (err) {
        console.error("Error fetching matches:", err);
        setError(err.message);
        if (!isBackgroundRefresh) {
          setMatches([]);
        }
      } finally {
        setLoading(false);
        setBackgroundRefreshing(false);
      }
    },
    [selectedDate]
  );

  // Inicijalno dohvaćanje prilikom promjene datuma
  useEffect(() => {
    fetchMatches(false); // Inicijalno učitavanje s loading
  }, [fetchMatches]);

  // Refetch funkcija za manual/auto refresh (bez loading)
  const refetch = useCallback(() => {
    return fetchMatches(true); // Background refresh
  }, [fetchMatches]);

  // Silent refresh funkcija (potpuno bez UI promjena)
  const silentRefresh = useCallback(() => {
    return fetchMatches(true);
  }, [fetchMatches]);

  return {
    matches,
    loading,
    backgroundRefreshing,
    error,
    refetch,
    silentRefresh,
  };
}
