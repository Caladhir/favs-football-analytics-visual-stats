// src/hooks/usePlayersData.js - Za vašu stvarnu bazu podataka
import { useState, useEffect, useCallback } from "react";
import supabase from "../services/supabase";

export const usePlayersData = (options = {}) => {
  const {
    limit = 50,
    position = "all",
    league = "all",
    sortBy = "name",
    searchQuery = "",
    includeStats = true,
    // statsFrom: broj dana unatrag; ako je <=0 ili null -> cijela sezona (bez vremenskog filtera)
    statsFrom = 30,
  } = options;

  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [total, setTotal] = useState(0);
  const [leagues, setLeagues] = useState([]);
  const [positions, setPositions] = useState([]);
  const [seasonTopScorers, setSeasonTopScorers] = useState([]);
  const [seasonTopAssists, setSeasonTopAssists] = useState([]);
  const [seasonTopRated, setSeasonTopRated] = useState([]);

  const fetchPlayers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      console.log('📊 Fetching real players data from your database...');

      const POSITION_GROUPS = {
        GK: ['GK','G'],
        DEF: ['DF','DEF','D','CB','LB','RB','RWB','LWB','CBR','CBL'],
        MID: ['MF','MID','M','CM','CDM','CAM','RM','LM','DM','AM'],
        FOR: ['FW','FWD','F','ST','CF','LW','RW','SS']
      };

  // We revert to paginated mode for performance; no fullFetchMode.
  const searchMode = searchQuery.trim().length > 0; // trigger search on any input (debounced upstream)
  const rankingMetric = ['rating','goals','assists','goalsPer90','assistsPer90','minutes','shotAccuracy'].includes(sortBy) ? sortBy : null;

      let base = supabase.from('players').select(`
        id,
        full_name,
        position,
        number,
        nationality,
        height_cm,
        date_of_birth,
        sofascore_id,
        created_at,
        team_id,
        teams:team_id (
          id, name, short_name, country, logo_url
        )
      `, { count: 'exact' });

      if (position !== 'all') {
        const rawSet = POSITION_GROUPS[position] || [];
        if (rawSet.length) base = base.in('position', rawSet);
      }
      if (searchQuery.trim()) base = base.ilike('full_name', `%${searchQuery}%`);

      const { data: playersData, error: playersErr, count } = await base.order('full_name', { ascending: true }).limit(limit);
      if (playersErr) throw new Error(`Players fetch failed: ${playersErr.message}`);
      console.log(`📄 Paged fetch mode loaded ${playersData?.length || 0}/${count}`);

      if (!playersData.length) {
        setPlayers([]);
        setTotal(0);
        return;
      }

      const normalizeGroup = (pos) => {
        if (!pos) return 'UNK';
        const p = pos.toUpperCase();
        if (POSITION_GROUPS.GK.includes(p)) return 'GK';
        if (POSITION_GROUPS.DEF.includes(p)) return 'DEF';
        if (POSITION_GROUPS.MID.includes(p)) return 'MID';
        if (POSITION_GROUPS.FOR.includes(p)) return 'FOR';
        return 'UNK';
      };

      const enrichedBase = playersData.map(pl => ({ ...pl, grouped_position: normalizeGroup(pl.position) }));
      let filtered = enrichedBase;
      if (league !== 'all') filtered = filtered.filter(p => p.teams?.country?.toLowerCase() === league.toLowerCase());
      if (position !== 'all') filtered = filtered.filter(p => p.grouped_position === position);

      // Supplemental fetch: ensure top stat leaders appear even if outside alphabetical slice
      const supplemental = [];
      if (rankingMetric && ['goals','assists','minutes','rating'].includes(rankingMetric)) {
        let orderCol = rankingMetric === 'minutes' ? 'total_minutes' : (rankingMetric === 'goals' ? 'total_goals' : 'total_assists');
        let topRows = [];
        if (rankingMetric === 'rating') {
          // lightweight aggregation for average rating (limit by last N stats rows)
          const { data: ratingRows, error: ratingErr } = await supabase
            .from('player_stats')
            .select('player_id, rating')
            .not('rating','is',null)
            .gt('rating',0)
            .limit(8000); // safety cap
          if (!ratingErr && ratingRows) {
            const aggR = {};
            ratingRows.forEach(r => {
              if (!r.player_id) return;
              if (!aggR[r.player_id]) aggR[r.player_id] = { sum:0, count:0 };
              aggR[r.player_id].sum += Number(r.rating) || 0;
              aggR[r.player_id].count += 1;
            });
            topRows = Object.entries(aggR)
              .map(([id,v]) => ({ id, avg: v.count? v.sum/v.count : 0 }))
              .filter(r => r.avg>0)
              .sort((a,b)=> b.avg - a.avg)
              .slice(0,30)
              .map(r => ({ id: r.id }));
          }
        } else {
          const { data: top, error: topErr } = await supabase
            .from('players_with_totals')
            .select('id, full_name, total_goals, total_assists, total_minutes')
            .order(orderCol, { ascending: false })
            .limit(30);
          if (!topErr && top) topRows = top;
        }
        const topErr = null; // unify variable presence
        if (!topErr && topRows) {
          // Filter topRows by league & position if those filters active
          const topFiltered = topRows.filter(r => {
            const pl = playersData.find(p => p.id === r.id); // quick lookup in current page
            if (!pl) return true; // if not in current page we still might fetch to check
            if (league !== 'all' && pl.teams?.country?.toLowerCase() !== league.toLowerCase()) return false;
            if (position !== 'all') {
              const gp = pl.position ? pl.position.toUpperCase() : '';
              // position already filtered earlier, but double-check
            }
            return true;
          });
          const missingIds = topFiltered.map(r => r.id).filter(id => !filtered.some(p => p.id === id));
            if (missingIds.length) {
              const { data: extraPlayers, error: extraErr } = await supabase.from('players').select(`
                id, full_name, position, number, nationality, height_cm, date_of_birth, sofascore_id, created_at, team_id,
                teams:team_id (id, name, short_name, country, logo_url)
              `).in('id', missingIds);
              if (!extraErr && extraPlayers) {
                const extraFiltered = extraPlayers.filter(pl => {
                  if (league !== 'all' && pl.teams?.country?.toLowerCase() !== league.toLowerCase()) return false;
                  if (position !== 'all' && normalizeGroup(pl.position) !== position) return false;
                  return true;
                });
                supplemental.push(...extraFiltered.map(pl => ({...pl, grouped_position: normalizeGroup(pl.position)})));
                console.log(`➕ Supplemental added ${extraFiltered.length}/${extraPlayers.length} (${rankingMetric}) after filters`);
              }
            }
        }
      }
      if (supplemental.length) {
        filtered = [...filtered, ...supplemental];
      }

      let playersWithStats = filtered;
  if (includeStats && filtered.length) {
        const playerIds = filtered.map(p => p.id);
        let statsFromDate = null;
        if (statsFrom > 0) { statsFromDate = new Date(); statsFromDate.setDate(statsFromDate.getDate() - statsFrom); }
        const statsCols = 'player_id, goals, assists, shots_total, shots_on_target, passes, tackles, rating, minutes_played, touches, created_at';
        const batchSize = 900;
        const statsData = [];
        for (let i=0;i<playerIds.length;i+=batchSize) {
          let q = supabase.from('player_stats').select(statsCols).in('player_id', playerIds.slice(i,i+batchSize)).order('created_at', { ascending: false });
          if (statsFromDate) q = q.gte('created_at', statsFromDate.toISOString());
          const { data, error } = await q;
          if (error) { console.warn('Stats batch failed', error.message); continue; }
          statsData.push(...(data||[]));
        }
        const agg = {};
        statsData.forEach(s => {
          if (!agg[s.player_id]) agg[s.player_id] = { games:0, goals:0, assists:0, shots:0, on:0, passes:0, tackles:0, minutes:0, touches:0, ratings:[] };
          const a = agg[s.player_id];
            a.games += 1;
            a.goals += s.goals || 0;
            a.assists += s.assists || 0;
            a.shots += s.shots_total || 0;
            a.on += s.shots_on_target || 0;
            a.passes += s.passes || 0;
            a.tackles += s.tackles || 0;
            a.minutes += s.minutes_played || 0;
            a.touches += s.touches || 0;
            if (s.rating && s.rating > 0) a.ratings.push(Number(s.rating));
        });
        playersWithStats = filtered.map(pl => {
          const s = agg[pl.id];
          if (!s) return { ...pl, stats: { games:0, goals:0, assists:0, shots:0, shotsOnTarget:0, passes:0, tackles:0, minutes:0, touches:0, rating:0, goalsPerGame:0, assistsPerGame:0, goalsPer90:0, assistsPer90:0, shotAccuracy:0, passAccuracy:0 } };
          const avgR = s.ratings.length ? s.ratings.reduce((x,y)=>x+y,0)/s.ratings.length : 0;
          const goalsPerGame = s.games ? +(s.goals / s.games).toFixed(2) : 0;
          const assistsPerGame = s.games ? +(s.assists / s.games).toFixed(2) : 0;
          const denom90 = s.minutes ? s.minutes / 90 : 0;
          const goalsPer90 = denom90 ? +(s.goals / denom90).toFixed(2) : 0;
          const assistsPer90 = denom90 ? +(s.assists / denom90).toFixed(2) : 0;
          const shotAccuracy = (s.on > 0 && s.shots > 0) ? +((s.on / s.shots)*100).toFixed(1) : 0;
          return { ...pl, stats: { games:s.games, goals:s.goals, assists:s.assists, shots:s.shots, shotsOnTarget:s.on, passes:s.passes, tackles:s.tackles, minutes:s.minutes, touches:s.touches, rating: +(avgR.toFixed(1)), goalsPerGame, assistsPerGame, goalsPer90, assistsPer90, shotAccuracy, passAccuracy: shotAccuracy } };
        });
      }

      // Additional client-side search refinement (case-insensitive)
      if (searchMode) {
        const q = searchQuery.trim().toLowerCase();
        playersWithStats = playersWithStats.filter(p => (p.full_name||'').toLowerCase().includes(q));
      }

      const tie = (a,b) => (a.full_name||'').localeCompare(b.full_name||'');
      playersWithStats.sort((a,b) => {
        const sa = a.stats || {}; const sb = b.stats || {};
        switch (sortBy) {
          case 'rating': return (sb.rating||0)-(sa.rating||0) || tie(a,b);
          case 'goals': return (sb.goals||0)-(sa.goals||0) || (sb.assists||0)-(sa.assists||0) || (sb.minutes||0)-(sa.minutes||0) || tie(a,b);
          case 'assists': return (sb.assists||0)-(sa.assists||0) || (sb.goals||0)-(sa.goals||0) || (sb.minutes||0)-(sa.minutes||0) || tie(a,b);
          case 'goalsPer90': return (sb.goalsPer90||0)-(sa.goalsPer90||0) || (sb.minutes||0)-(sa.minutes||0) || tie(a,b);
          case 'assistsPer90': return (sb.assistsPer90||0)-(sa.assistsPer90||0) || (sb.minutes||0)-(sa.minutes||0) || tie(a,b);
          case 'minutes': return (sb.minutes||0)-(sa.minutes||0) || tie(a,b);
          case 'shotAccuracy': return (sb.shotAccuracy||0)-(sa.shotAccuracy||0) || tie(a,b);
          case 'team': return (a.teams?.name||'').localeCompare(b.teams?.name||'') || tie(a,b);
          case 'name': default: return tie(a,b);
        }
      });

  // We stay in paginated mode; if supplemental pushed us over limit allow overflow so leaders show.
  setPlayers(playersWithStats);
  setTotal(count || playersWithStats.length);
    } catch (err) {
      console.error('❌ Error fetching players:', err);
      setError(err.message);
      setPlayers([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [limit, position, league, sortBy, searchQuery, includeStats, statsFrom]);

  // Season-wide leaders using aggregated DB view (independent of current window/limit)
  const fetchSeasonLeaders = useCallback(async () => {
    try {
      // Goals / Assists from materialized/aggregated view
      const baseSelect = 'id, full_name, total_goals, total_assists, total_matches, total_minutes';
      const [{ data: goalsData }, { data: assistsData }] = await Promise.all([
        supabase.from('players_with_totals').select(baseSelect).order('total_goals', { ascending: false }).limit(10),
        supabase.from('players_with_totals').select(baseSelect).order('total_assists', { ascending: false }).limit(10),
      ]);
      if (goalsData) setSeasonTopScorers(goalsData.filter(p => (p.total_goals || 0) > 0));
      if (assistsData) setSeasonTopAssists(assistsData.filter(p => (p.total_assists || 0) > 0));

      // Rating aggregation (client side) – fetch only needed columns
      const { data: ratingRows } = await supabase
        .from('player_stats')
        .select('player_id, rating, minutes_played')
        .not('rating', 'is', null)
        .gt('rating', 0);
      if (ratingRows && ratingRows.length) {
        const agg = {};
        ratingRows.forEach(r => {
          if (!r.player_id) return;
            const pid = r.player_id;
            if (!agg[pid]) {
              agg[pid] = { sum: 0, count: 0, minutes: 0 };
            }
            agg[pid].sum += Number(r.rating) || 0;
            agg[pid].count += 1;
            agg[pid].minutes += r.minutes_played || 0;
        });
        // Build list with threshold (>=0 mins now to include all, adjust if noisy)
        const ratedList = Object.entries(agg)
          .filter(([, v]) => v.count > 0 && v.minutes >= 0)
          .map(([player_id, v]) => ({ player_id, avg_rating: +(v.sum / v.count).toFixed(1), minutes: v.minutes }));
        ratedList.sort((a,b) => b.avg_rating - a.avg_rating);
        const topRatingIds = ratedList.slice(0, 15).map(r => r.player_id);
        if (topRatingIds.length) {
          const { data: namesData } = await supabase.from('players').select('id, full_name').in('id', topRatingIds);
          const nameMap = Object.fromEntries((namesData||[]).map(p => [p.id, p.full_name]));
          // Merge with totals for possible team/minutes if present
          const totalsMap = {};
          [...(goalsData||[]), ...(assistsData||[])].forEach(p => { totalsMap[p.id] = p; });
          const finalRated = ratedList.slice(0, 10).map(r => ({
            id: r.player_id,
            full_name: nameMap[r.player_id] || 'Unknown',
            avg_rating: r.avg_rating,
            total_minutes: totalsMap[r.player_id]?.total_minutes,
            total_matches: totalsMap[r.player_id]?.total_matches,
          }));
          setSeasonTopRated(finalRated);
        }
      }
    } catch (e) {
      console.warn('Failed to fetch season leaders', e);
    }
  }, []);

  useEffect(() => { fetchSeasonLeaders(); }, [fetchSeasonLeaders]);

  // Dohvaća metadata (pozicije i lige)
  const fetchMetadata = useCallback(async () => {
    try {
      console.log("📋 Fetching metadata from database...");

      // Dohvaća jedinstvene pozicije i mapira u GK/DEF/MID/FOR
      const { data: positionsData } = await supabase
        .from("players")
        .select("position")
        .not("position", "is", null);

      if (positionsData) {
        const POSITION_GROUPS = {
          GK: ["GK", "G"],
          DEF: ["DF", "DEF", "D", "CB", "LB", "RB", "RWB", "LWB", "CBR", "CBL"],
          MID: ["MF", "MID", "M", "CM", "CDM", "CAM", "RM", "LM", "DM", "AM"],
          FOR: ["FW", "FWD", "F", "ST", "CF", "LW", "RW", "SS"],
        };
        const groupsSet = new Set();
        positionsData.forEach((p) => {
          const code = p.position?.toUpperCase();
            Object.entries(POSITION_GROUPS).forEach(([grp, arr]) => {
              if (code && arr.includes(code)) groupsSet.add(grp);
            });
        });
        const ordered = ["GK", "DEF", "MID", "FOR"].filter((g) => groupsSet.has(g));
        setPositions(ordered);
        console.log("📍 Position groups:", ordered);
      }

      // Dohvaća jedinstvene zemlje iz teams tablice
      const { data: countriesData } = await supabase
        .from("teams")
        .select("country")
        .not("country", "is", null)
        .neq("country", "");

      if (countriesData) {
        const uniqueCountries = [
          ...new Set(countriesData.map((t) => t.country)),
        ]
          .filter(Boolean)
          .sort();
        setLeagues(uniqueCountries);
        console.log(
          `🌍 Found ${uniqueCountries.length} unique countries:`,
          uniqueCountries
        );
      }
    } catch (err) {
      console.warn("⚠️ Failed to fetch metadata:", err);
    }
  }, []);

  const refetch = useCallback(() => {
    fetchPlayers();
    fetchMetadata();
  }, [fetchPlayers, fetchMetadata]);

  useEffect(() => {
    fetchPlayers();
    fetchMetadata();
  }, [fetchPlayers, fetchMetadata]);

  const getPlayerById = useCallback(
    (playerId) => {
      return players.find((p) => p.id === playerId);
    },
    [players]
  );

  const getTopPlayers = useCallback(
    (stat, limitCount = 5) => {
      return players
        .filter((p) => p.stats && p.stats[stat] > 0)
        .sort((a, b) => (b.stats[stat] || 0) - (a.stats[stat] || 0))
        .slice(0, limitCount);
    },
    [players]
  );

  return {
    players,
    loading,
    error,
    total,
    leagues,
    positions,
    refetch,
    getPlayerById,
    getTopPlayers,
    topScorers: getTopPlayers("goals", 10),
    topAssists: getTopPlayers("assists", 10),
    topRated: getTopPlayers("rating", 10),
  seasonTopScorers,
  seasonTopAssists,
  seasonTopRated,
    // Dodano za debug
    isEmpty: players.length === 0 && !loading && !error,
    hasData: players.length > 0,
  };
};
