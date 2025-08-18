// src/features/homepage/LiveMatchTicker.jsx
// ============================================
import React, { useState, useEffect, useRef } from "react";
import supabase from "../../services/supabase";

const TOP25_SOFA_IDS = [
  17, 23, 8, 35, 34, 37, 238, 38, 52, 172, 185, 20, 202, 39, 45, 215, 36, 40,
  266, 171, 170, 210, 187, 152, 211,
];

export default function LiveMatchTicker() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const tickerRef = useRef(null);
  const [scrollX, setScrollX] = useState(0);

  // helper: normalize strings for comparison
  const normalize = (s) =>
    String(s || "")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, "")
      .trim();

  useEffect(() => {
    const fetchLiveMatches = async () => {
      setLoading(true);
      try {
        // 1) Fetch SofaScore rankings and build top150 set (use rowName / team.slug / team.name)
        let top150Set = new Set();
        try {
          const r = await fetch(
            "https://www.sofascore.com/api/v1/rankings/season/2026/type/9"
          );
          if (r.ok) {
            const json = await r.json();
            const top150 = (json.rankings || []).slice(0, 150);
            top150.forEach((entry) => {
              const val =
                entry.team?.slug || entry.team?.name || entry.rowName || "";
              const n = normalize(val);
              if (n) top150Set.add(n);
            });
          } else {
            console.warn("Failed to fetch SofaScore rankings:", r.status);
          }
        } catch (err) {
          console.error("Error fetching SofaScore rankings:", err);
        }

        // 2) Fetch live/ht matches from supabase (broader set) and filter locally
        const { data, error } = await supabase
          .from("matches")
          .select(
            "id, home_team, away_team, home_score, away_score, status, start_time, competition_id"
          )
          .in("status", ["live", "ht"])
          .order("start_time", { ascending: false })
          .limit(200); // fetch more, then filter down

        if (error) {
          console.error("Supabase error:", error);
        } else if (data) {
          // keep matches that are in top25 competitions OR involve a top150 team
          const filtered = data.filter((m) => {
            if (TOP25_SOFA_IDS.includes(m.competition_id)) return true;
            const home = normalize(m.home_team);
            const away = normalize(m.away_team);
            if (top150Set.has(home) || top150Set.has(away)) return true;
            return false;
          });

          const formattedMatches = filtered.slice(0, 40).map((match) => ({
            home: match.home_team,
            away: match.away_team,
            score: `${match.home_score ?? 0}-${match.away_score ?? 0}`,
            status: match.status,
          }));
          setMatches(formattedMatches);
        }
      } catch (error) {
        console.error("Error fetching matches:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchLiveMatches();
    const interval = setInterval(fetchLiveMatches, 30000);
    return () => clearInterval(interval);
  }, []);

  // Smooth scroll
  useEffect(() => {
    let raf;
    const speed = 0.5; // px per frame
    const animate = () => {
      setScrollX((prev) => {
        const width = tickerRef.current?.scrollWidth || 0;
        return width === 0 ? 0 : (prev + speed) % width;
      });
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [matches]);

  if (loading) {
    return (
      <div className="h-10 bg-black/20 backdrop-blur-sm border-y border-red-500/20 animate-pulse" />
    );
  }

  if (matches.length === 0) {
    return (
      <div className="h-10 bg-black/20 backdrop-blur-sm border-y border-red-500/20 flex items-center justify-center">
        <span className="text-sm text-gray-400">
          Nema live utakmica u top 25 liga trenutno
        </span>
      </div>
    );
  }

  return (
    <div className="overflow-hidden relative h-10 bg-black/20 backdrop-blur-sm border-y border-red-500/20">
      <div
        ref={tickerRef}
        className="flex items-center h-full whitespace-nowrap"
        style={{ transform: `translateX(-${scrollX}px)`, transition: "none" }}
      >
        {[...matches, ...matches].map((match, i) => (
          <div key={i} className="inline-flex items-center mx-8">
            <span
              className={`w-2 h-2 rounded-full mr-2 ${
                match.status === "live"
                  ? "bg-red-500 animate-pulse"
                  : "bg-yellow-500"
              }`}
            />
            <span className="text-sm text-white">
              {match.home}
              <span
                className={`font-bold mx-2 ${
                  match.status === "live" ? "text-red-400" : "text-gray-400"
                }`}
              >
                {match.score}
              </span>
              {match.away}
              {match.status === "ht" && (
                <span className="ml-2 text-xs text-yellow-400">HT</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
