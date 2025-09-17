// src/hooks/useTopScorers.js - FIXED VERSION
import { useState, useEffect, useCallback, useRef } from "react";
import supabase from "../services/supabase";
import {
  aggregatePlayerStats,
  computeTopScorersFromAgg,
} from "../utils/playerStatsAggregator";

// period: '7d' | '30d' | 'season'
export function useTopScorers(limit = 5, period = "30d") {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [scorers, setScorers] = useState([]);

  const mountedRef = useRef(true);

  const fetchTopScorers = useCallback(async () => {
    if (!mountedRef.current) return;

    try {
      setLoading(true);
      setError(null);

      if (period === "season") {
        // Season: leverage aggregated view for accuracy & performance
        const { data, error: seasonErr } = await supabase
          .from("players_with_totals")
          .select("id, full_name, total_goals, total_assists, total_minutes")
          .order("total_goals", { ascending: false })
          .limit(limit * 3); // over-fetch for proper tie-breaking then slice
        if (seasonErr) throw new Error(seasonErr.message);
        const rows = (data || [])
          .filter((r) => (r.total_goals || 0) > 0)
          .sort(
            (a, b) =>
              (b.total_goals || 0) - (a.total_goals || 0) ||
              (b.total_assists || 0) - (a.total_assists || 0) ||
              (b.total_minutes || 0) - (a.total_minutes || 0) ||
              (a.full_name || "").localeCompare(b.full_name || "")
          )
          .slice(0, limit)
          .map((r, idx) => ({
            rank: idx + 1,
            id: r.id,
            name: r.full_name,
            goals: r.total_goals || 0,
            assists: r.total_assists || 0,
            minutes: r.total_minutes || 0,
          }));
        setScorers(rows);
        return;
      }

      // Rolling window (7d/30d) – server-side aggregation attempt (faster) with fallback.
      let days = period === "7d" ? 7 : 30;
      if (period !== "7d" && period !== "30d") days = 30;
      const boundaryDate = new Date();
      boundaryDate.setDate(boundaryDate.getDate() - days);
      const boundaryIso = boundaryDate.toISOString();

      let aggData = [];
      let aggError = null;
      try {
        // Attempt a grouped aggregation via RPC or raw select if a view exists.
        // If you later add a database view (e.g., recent_player_stats_30d) you can branch on period.
        const { data, error: qErr } = await supabase
          .from("player_stats")
          .select("player_id, goals, assists, minutes_played")
          .gte("created_at", boundaryIso);
        if (qErr) throw qErr;
        // Aggregate client-side but only over minimal columns (lighter than full rows approach)
        const slimAgg = {};
        (data || []).forEach((r) => {
          if (!r.player_id) return;
          if (!slimAgg[r.player_id])
            slimAgg[r.player_id] = { goals: 0, assists: 0, minutes: 0 };
          slimAgg[r.player_id].goals += r.goals || 0;
          slimAgg[r.player_id].assists += r.assists || 0;
          slimAgg[r.player_id].minutes += r.minutes_played || 0;
        });
        aggData = Object.entries(slimAgg).map(([pid, v]) => ({
          player_id: pid,
          ...v,
        }));
      } catch (e) {
        aggError = e;
      }

      if (aggError) {
        // Fallback to previous full pagination (robust but slower)
        const statsCols =
          "player_id, goals, assists, shots_total, shots_on_target, passes, tackles, rating, minutes_played, touches, created_at";
        const pageSize = 1000;
        let allStats = [];
        for (let page = 0; page < 40; page++) {
          const from = page * pageSize;
          const to = from + pageSize - 1;
          const { data: pageRows, error: pageErr } = await supabase
            .from("player_stats")
            .select(statsCols)
            .gte("created_at", boundaryIso)
            .range(from, to);
          if (pageErr) throw pageErr;
          if (!pageRows || pageRows.length === 0) break;
          allStats = allStats.concat(pageRows);
          if (pageRows.length < pageSize) break;
        }
        const aggMap = aggregatePlayerStats(allStats || []);
        aggData = Object.entries(aggMap).map(([player_id, s]) => ({
          player_id,
          goals: s.goals || 0,
          assists: s.assists || 0,
          minutes: s.minutes || 0,
        }));
      }

      if (!aggData.length) {
        setScorers([]);
        return;
      }
      aggData.sort(
        (a, b) =>
          (b.goals || 0) - (a.goals || 0) ||
          (b.assists || 0) - (a.assists || 0) ||
          (b.minutes || 0) - (a.minutes || 0) ||
          0
      );
      const topSlice = aggData.slice(0, limit * 3);
      const topIds = topSlice.map((r) => r.player_id);
      const { data: playersData, error: playersErr } = await supabase
        .from("players")
        .select("id, full_name")
        .in("id", topIds);
      if (playersErr) throw playersErr;
      const nameMap = Object.fromEntries(
        (playersData || []).map((p) => [p.id, p.full_name])
      );
      const finalRows = topSlice
        .map((r) => ({
          id: r.player_id,
          name: nameMap[r.player_id] || "Unknown",
          goals: r.goals,
          assists: r.assists,
          minutes: r.minutes,
        }))
        .sort(
          (a, b) =>
            (b.goals || 0) - (a.goals || 0) ||
            (b.assists || 0) - (a.assists || 0) ||
            (b.minutes || 0) - (a.minutes || 0) ||
            (a.name || "").localeCompare(b.name || "")
        )
        .slice(0, limit)
        .map((r, idx) => ({ ...r, rank: idx + 1 }));
      setScorers(finalRows);
    } catch (err) {
      if (!mountedRef.current) return;
      console.error("Error fetching top scorers:", err);
      setError(err.message || "Failed to load top scorers");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [limit, period]);

  useEffect(() => {
    mountedRef.current = true;
    fetchTopScorers();
    return () => {
      mountedRef.current = false;
    };
  }, [fetchTopScorers]);

  return { scorers, loading, error, refetch: fetchTopScorers };
}
