// src/hooks/useUpcomingMatches.js
import { useEffect, useMemo, useRef, useState } from "react";
import supabase from "../services/supabase";
import { normalizeStatus } from "../utils/matchStatusUtils";

// statusi koje NE želimo u "upcoming"
const EXCLUDE = new Set(["live", "ht", "finished", "ft"]);

// helper: uvijek vrati pravi Date
function toDate(x) {
  if (x instanceof Date) return x;
  if (typeof x === "number") return new Date(x);
  if (typeof x === "string") return new Date(x);
  if (x && typeof x === "object" && x.start) return new Date(x.start);
  return new Date();
}

// clamp: najmanje "sada"
function clampFromNow(d) {
  const now = new Date();
  const dt = toDate(d);
  return dt < now ? now : dt;
}

export default function useUpcomingMatches({
  from,
  to,
  auto = true,
  intervalMs = 30000,
} = {}) {
  // od sada → (opcionalno) do “to” (default +24h)
  const fromClamped = clampFromNow(from);
  const toDateFinal = to
    ? toDate(to)
    : new Date(fromClamped.getTime() + 24 * 60 * 60 * 1000);

  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bgRefreshing, setBgRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const reqId = useRef(0);

  const range = useMemo(
    () => ({
      fromISO: fromClamped.toISOString(),
      toISO: toDateFinal.toISOString(),
    }),
    [fromClamped.getTime(), toDateFinal.getTime()]
  );

  const fetchUpcoming = async (background = false) => {
    const id = ++reqId.current;
    background ? setBgRefreshing(true) : setLoading(true);
    setError(null);

    try {
      // dohvat: start_time >= now, i isključi live/ht/finished
      const { data, error } = await supabase
        .from("matches")
        .select(
          "id,home_team,away_team,competition,start_time,status,status_type,updated_at,home_score,away_score"
        )
        .gte("start_time", range.fromISO)
        .lt("start_time", range.toISO)
        .not("status", "in", "(live,ht,finished,ft)")
        .order("start_time", { ascending: true });

      if (id !== reqId.current) return; // zastarjeli rezultat

      if (error) throw error;

      const cleaned = (data || []).filter(
        (m) => !EXCLUDE.has(normalizeStatus(m.status || m.status_type))
      );
      setMatches(cleaned);
    } catch (e) {
      setError(e);
      setMatches([]);
    } finally {
      background ? setBgRefreshing(false) : setLoading(false);
    }
  };

  // prvi load i promjena range-a
  useEffect(() => {
    fetchUpcoming(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.fromISO, range.toISO]);

  // auto-refresh (svakih 30s)
  useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => fetchUpcoming(true), intervalMs);
    return () => clearInterval(t);
  }, [auto, intervalMs]);

  // realtime – ako želiš, možeš ostaviti isključeno; upcoming se rijetko mijenja u milisekundi
  // (po potrebi doda se channel na "matches" i filtrira na status !in live/ht/finished)

  return {
    matches,
    loading,
    backgroundRefreshing: bgRefreshing,
    error,
    range,
    refresh: () => fetchUpcoming(false),
  };
}
