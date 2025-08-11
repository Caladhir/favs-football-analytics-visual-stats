import { useState, useEffect, useCallback, useRef } from "react";
import supabase from "../services/supabase";
import { getValidLiveMatchesStrict } from "../utils/liveMatchFilters";
import { useAutoRefresh } from "./useAutoRefresh";

const LIVE_SET = new Set(["live", "ht", "inprogress", "halftime"]);

export function useLiveMatches(autoFetch = true) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [backgroundRefreshing, setBackgroundRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const applyStrict = useCallback((rows) => {
    return getValidLiveMatchesStrict(rows, {
      staleCutoffSec: 240,
      maxAgeHours: 3,
      htCutoffSec: 1200,
    });
  }, []);

  const fetchLiveMatches = useCallback(
    async (bg = false) => {
      try {
        if (!mountedRef.current) return;
        !bg ? setLoading(true) : setBackgroundRefreshing(true);
        setError(null);

        const { data, error: fetchError } = await supabase
          .from("matches")
          .select(
            `
          id, home_team, away_team, home_score, away_score, start_time,
          status, status_type, competition, competition_id, season, round,
          venue, minute, home_color, away_color, current_period_start,
          source, updated_at
        `
          )
          .in("status", Array.from(LIVE_SET))
          .order("start_time", { ascending: false });

        if (fetchError) throw fetchError;

        const strict = applyStrict(data || []);
        if (!mountedRef.current) return;
        setMatches(strict);

        if (import.meta.env.DEV) {
          console.log(
            `🔴 Live fetched: ${strict.length}/${(data || []).length}`
          );
        }
      } catch (e) {
        if (!mountedRef.current) return;
        console.error(e);
        setError(e?.message || "Unknown error");
        if (!bg) setMatches([]);
      } finally {
        if (!mountedRef.current) return;
        setLoading(false);
        setBackgroundRefreshing(false);
      }
    },
    [applyStrict]
  );

  // Initial + na promjenu fokusa prozora
  useEffect(() => {
    if (!autoFetch) return;
    fetchLiveMatches(false);

    const onVis = () => {
      if (document.visibilityState === "visible") fetchLiveMatches(true);
    };
    window.addEventListener("visibilitychange", onVis);
    return () => window.removeEventListener("visibilitychange", onVis);
  }, [autoFetch, fetchLiveMatches]);

  // Auto-refresh svakih 15s dok ima live
  useAutoRefresh(matches, () => fetchLiveMatches(true), 15000);

  // Realtime: slušaj SVE promjene pa lokalno odluči zadržati/izbaciti
  useEffect(() => {
    if (!autoFetch) return;

    const channel = supabase
      .channel("matches-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "matches" },
        (payload) => {
          if (!mountedRef.current) return;
          const row = payload.new;
          if (!row || !row.id) return;

          const status = String(
            row.status || row.status_type || ""
          ).toLowerCase();
          const isLiveNow = LIVE_SET.has(status);
          const strictLiveNow = isLiveNow && applyStrict([row]).length > 0;

          setMatches((prev) => {
            const idx = prev.findIndex((m) => m.id === row.id);

            // ako više NIJE live ili je postao zastario -> ukloni
            if (!strictLiveNow) {
              if (idx === -1) return prev;
              const copy = [...prev];
              copy.splice(idx, 1);
              return copy;
            }

            // live i ne postoji -> dodaj
            if (idx === -1) return [row, ...applyStrict(prev)];

            // update postojećeg
            const copy = [...prev];
            copy[idx] = { ...copy[idx], ...row };
            return applyStrict(copy);
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [autoFetch, applyStrict]);

  // Lokalno “čišćenje” svakih 8s (za slučaj propuštenih eventa)
  useEffect(() => {
    const id = setInterval(() => {
      setMatches((prev) => applyStrict(prev));
    }, 8000);
    return () => clearInterval(id);
  }, [applyStrict]);

  return { matches, loading, backgroundRefreshing, error, fetchLiveMatches };
}
