// src/hooks/useMatchData.js
import { useEffect, useMemo, useState, useCallback } from "react";
import supabase from "../services/supabase";
import { validateLiveStatus } from "../utils/matchStatusUtils";

export default function useMatchData(matchId) {
  const [match, setMatch] = useState(null);
  const [events, setEvents] = useState([]);
  const [lineups, setLineups] = useState({ home: [], away: [] });
  const [formations, setFormations] = useState({ home: null, away: null });
  const [playerStats, setPlayerStats] = useState([]);
  const [h2h, setH2h] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bgRefreshing, setBgRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchMatch = useCallback(
    async (isBg = false) => {
      try {
        setError(null);
        if (!isBg) setLoading(true);
        else setBgRefreshing(true);

        // 1) MATCH
        const { data: m, error: em } = await supabase
          .from("matches")
          .select(
            `
          id, home_team, away_team, home_score, away_score,
          start_time, status, status_type, minute,
          competition, competition_id, venue, round, season,
          home_team_id, away_team_id, league_priority,
          updated_at, current_period_start
        `
          )
          .eq("id", matchId)
          .maybeSingle();
        if (em) throw em;
        setMatch(m);

        // Early stop if no match
        if (!m) {
          setEvents([]);
          setLineups({ home: [], away: [] });
          setFormations({ home: null, away: null });
          setPlayerStats([]);
          setH2h([]);
          return;
        }

        // 2) EVENTS
        const { data: ev, error: eev } = await supabase
          .from("match_events")
          .select(
            `id, minute, event_type, player_name, team, description, created_at`
          )
          .eq("match_id", matchId)
          .order("minute", { ascending: true });
        if (eev) throw eev;
        setEvents(ev || []);

        // 3) LINEUPS
        const { data: lu, error: elu } = await supabase
          .from("lineups")
          .select(
            `
          id, match_id, team_id, player_id, position, jersey_number, is_starting, is_captain,
          players:player_id(id, full_name, position, number, nationality, age)
        `
          )
          .eq("match_id", matchId);
        if (elu) throw elu;

        // 3.1) FORMATIONS
        const { data: forms, error: eforms } = await supabase
          .from("formations")
          .select(`id, match_id, team_id, formation`)
          .eq("match_id", matchId);
        if (eforms) throw eforms;

        // Map home/away by team name (fallback) or team_id (ako postoji)
        const isHome = (row) => {
          if (m?.home_team_id && row.team_id)
            return row.team_id === m.home_team_id;
          // fallback by name hint: team name je u events.team/ponekad u players? – nemamo; pretpostavimo prvih 11 podijelit ćemo po broju
          // bolji heuristics: ako team_id nema, split ćemo po is_starting + jersey_number i team ordering
          // ali imamo formations.team_id pa možemo detektirati:
          if (forms?.length) {
            const fh = forms.find((f) => f.formation && f.team_id);
            const fa = forms.find(
              (f) => f.formation && f.team_id && f.team_id !== fh?.team_id
            );
            if (fh && fa) return row.team_id === fh.team_id;
          }
          // fallback na playerStats kasnije; ovdje default -> home
          return true;
        };

        const grouped = { home: [], away: [] };
        (lu || []).forEach((r) => {
          if (isHome(r)) grouped.home.push(r);
          else grouped.away.push(r);
        });
        setLineups(grouped);

        const fObj = { home: null, away: null };
        if (forms?.length) {
          if (m?.home_team_id) {
            fObj.home =
              forms.find((f) => f.team_id === m.home_team_id)?.formation ||
              null;
            fObj.away =
              forms.find((f) => f.team_id === m.away_team_id)?.formation ||
              null;
          } else {
            // nema team_id – uzmi prva dva unique team_id iz lineups
            const ids = Array.from(
              new Set((lu || []).map((x) => x.team_id).filter(Boolean))
            );
            fObj.home =
              forms.find((f) => f.team_id === ids[0])?.formation || null;
            fObj.away =
              forms.find((f) => f.team_id === ids[1])?.formation || null;
          }
        }
        setFormations(fObj);

        // 4) PLAYER STATS
        const { data: ps, error: eps } = await supabase
          .from("player_stats")
          .select(
            `
          id, match_id, player_id, team_id,
          goals, assists, shots, passes, tackles, minutes_played, rating,
          players:player_id(id, full_name, position, number),
          teams:team_id(id, name)
        `
          )
          .eq("match_id", matchId);
        if (eps) throw eps;
        setPlayerStats(ps || []);

        // 5) H2H – zadnjih 10 susreta po nazivima ekipa (dok ne povežemo team_id svugdje)
        const { data: h, error: eh } = await supabase
          .from("matches")
          .select(
            "id, home_team, away_team, home_score, away_score, start_time, competition, status"
          )
          .or(
            `and(home_team.eq.${m.home_team},away_team.eq.${m.away_team}),and(home_team.eq.${m.away_team},away_team.eq.${m.home_team})`
          )
          .neq("id", matchId)
          .order("start_time", { ascending: false })
          .limit(10);
        if (eh) throw eh;
        setH2h(h || []);
      } catch (e) {
        console.error(e);
        setError(e.message || "Failed loading match");
      } finally {
        setLoading(false);
        setBgRefreshing(false);
      }
    },
    [matchId]
  );

  useEffect(() => {
    fetchMatch(false);
  }, [fetchMatch]);

  // auto refresh kad je live
  useEffect(() => {
    if (!match) return;
    const status = validateLiveStatus(match);
    if (status === "live" || status === "ht") {
      const t = setInterval(() => fetchMatch(true), 30000);
      return () => clearInterval(t);
    }
  }, [match, fetchMatch]);

  const homeName = match?.home_team || "Home";
  const awayName = match?.away_team || "Away";

  const agg = useMemo(() => {
    // jednostavna agregacija iz playerStats (shots/goals/pass/tackles)
    const sum = (rows, f) => rows.reduce((a, b) => a + (Number(b[f]) || 0), 0);

    const byHome = playerStats.filter((r) =>
      match?.home_team_id
        ? r.team_id === match.home_team_id
        : r.teams?.name === homeName
    );
    const byAway = playerStats.filter((r) =>
      match?.away_team_id
        ? r.team_id === match.away_team_id
        : r.teams?.name === awayName
    );

    return {
      home: {
        goals: sum(byHome, "goals"),
        shots: sum(byHome, "shots"),
        passes: sum(byHome, "passes"),
        tackles: sum(byHome, "tackles"),
      },
      away: {
        goals: sum(byAway, "goals"),
        shots: sum(byAway, "shots"),
        passes: sum(byAway, "passes"),
        tackles: sum(byAway, "tackles"),
      },
    };
  }, [playerStats, match, homeName, awayName]);

  return {
    match,
    events,
    lineups,
    formations,
    playerStats,
    h2h,
    agg,
    loading,
    bgRefreshing,
    error,
    refetch: () => fetchMatch(true),
  };
}
