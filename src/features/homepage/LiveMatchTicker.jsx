// src/features/homepage/LiveMatchTicker.jsx - ENHANCED WITH SMOOTH ANIMATIONS
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

  // Helper: normalize strings for comparison
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
        // 1) Build a set of DB competition IDs that correspond to TOP25 SofaScore IDs
        let top25DbIds = new Set();
        try {
          const { data: comps, error: compErr } = await supabase
            .from("competitions")
            .select("id, sofascore_id")
            .in("sofascore_id", TOP25_SOFA_IDS);
          if (!compErr && comps) {
            comps.forEach((c) => top25DbIds.add(c.id));
          } else if (compErr) {
            console.warn("Failed to map TOP25 competitions:", compErr.message);
          }
        } catch (e) {
          console.warn("Error loading competitions for TOP25 mapping:", e);
        }

        // 2) Fetch SofaScore rankings and build top150 set
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

        // 3) Fetch live/ht matches from Supabase and filter locally
        const { data, error } = await supabase
          .from("matches")
          .select(
            "id, home_team, away_team, home_score, away_score, status, start_time, competition_id"
          )
          .in("status", ["live", "ht"])
          .order("start_time", { ascending: false })
          .limit(200);

        if (error) {
          console.error("Supabase error:", error);
        } else if (data) {
          // Keep matches that are in top25 competitions OR involve a top150 team
          const filtered = data.filter((m) => {
            if (m.competition_id && top25DbIds.has(m.competition_id))
              return true;
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

  // Smooth continuous scroll animation
  useEffect(() => {
    if (matches.length === 0) return;

    let animationId;
    const speed = 0.8; // Pixels per frame

    const animate = () => {
      setScrollX((prev) => {
        const element = tickerRef.current;
        if (!element) return prev;

        const contentWidth = element.scrollWidth / 2; // Divided by 2 because we duplicate content
        const newX = prev + speed;

        // Reset when we've scrolled through one complete set
        return newX >= contentWidth ? 0 : newX;
      });
      animationId = requestAnimationFrame(animate);
    };

    animationId = requestAnimationFrame(animate);
    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [matches]);

  if (loading) {
    return (
      <section className="relative z-10 py-4 overflow-hidden">
        <div className="bg-gradient-to-r from-red-600/15 via-red-500/25 to-red-600/15 backdrop-blur-sm border-y border-red-500/20 animate-pulse">
          <div className="h-12 flex items-center justify-center">
            <span className="text-sm text-gray-400">
              Loading live matches...
            </span>
          </div>
        </div>
      </section>
    );
  }

  if (matches.length === 0) {
    return (
      <section className="relative z-10 py-4 overflow-hidden">
        <div className="bg-gradient-to-r from-red-600/15 via-red-500/25 to-red-600/15 backdrop-blur-sm border-y border-red-500/20">
          <div className="h-12 flex items-center justify-center">
            <span className="text-sm text-gray-400">
              No live matches in top leagues currently
            </span>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="relative z-10 py-4 overflow-hidden w-full">
      <div className="bg-gradient-to-r from-red-600/15 via-red-500/25 to-red-600/15 backdrop-blur-sm border-y border-red-500/30">
        {/* Animated ticker */}
        <div className="relative h-12 overflow-hidden w-full">
          <div
            ref={tickerRef}
            className="flex items-center h-full whitespace-nowrap absolute left-0"
            style={{
              transform: `translateX(-${scrollX}px)`,
              willChange: "transform",
              minWidth: "max-content",
            }}
          >
            {/* Duplicate content for seamless loop */}
            {[...matches, ...matches].map((match, index) => (
              <div
                key={`${match.home}-${match.away}-${index}`}
                className="flex items-center mx-8 flex-shrink-0"
              >
                {/* Status indicator */}
                <div className="flex items-center mr-4">
                  <div
                    className={`w-2 h-2 rounded-full mr-2 ${
                      match.status === "live"
                        ? "bg-red-500 animate-pulse shadow-lg shadow-red-500/50"
                        : "bg-yellow-500 animate-pulse shadow-lg shadow-yellow-500/50"
                    }`}
                  />
                  <span className="text-xs font-bold text-white/60 uppercase tracking-wider">
                    {match.status === "live" ? "LIVE" : "HT"}
                  </span>
                </div>

                {/* Match info */}
                <div className="text-sm font-semibold">
                  <span className="text-white hover:text-red-300 transition-colors">
                    {match.home}
                  </span>
                  <span
                    className={`mx-3 font-bold px-2 py-1 rounded ${
                      match.status === "live"
                        ? "text-red-300 bg-red-500/20"
                        : "text-yellow-300 bg-yellow-500/20"
                    }`}
                  >
                    {match.score}
                  </span>
                  <span className="text-white hover:text-red-300 transition-colors">
                    {match.away}
                  </span>
                </div>

                {/* Separator */}
                <div className="mx-6 w-px h-6 bg-red-500/30" />
              </div>
            ))}
          </div>
        </div>

        {/* Fade edges for smooth appearance */}
        <div className="absolute top-0 left-0 w-20 h-full bg-gradient-to-r from-black/50 to-transparent pointer-events-none" />
        <div className="absolute top-0 right-0 w-20 h-full bg-gradient-to-l from-black/50 to-transparent pointer-events-none" />
      </div>
    </section>
  );
}
