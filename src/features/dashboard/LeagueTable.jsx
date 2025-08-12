// src/features/dashboard/LeagueTable.jsx
import { useEffect, useMemo, useState } from "react";
import supabase from "../../services/supabase";

function Row({ i, team }) {
  return (
    <div className="grid grid-cols-[24px_1fr_56px] items-center py-2 px-3 rounded hover:bg-muted/40">
      <div className="text-xs text-muted-foreground">{i}</div>
      <div className="truncate text-sm font-medium">{team.name}</div>
      <div className="text-right font-semibold">{team.points}</div>
    </div>
  );
}

export default function LeagueTable() {
  const [loading, setLoading] = useState(true);
  const [teams, setTeams] = useState([]);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      const since = new Date(
        Date.now() - 30 * 24 * 60 * 60 * 1000
      ).toISOString();
      const { data } = await supabase
        .from("matches")
        .select("home_team,away_team,home_score,away_score,start_time,status")
        .gte("start_time", since);

      const table = new Map();
      const add = (name, pts) => {
        table.set(name, (table.get(name) || 0) + pts);
      };

      (data || []).forEach((m) => {
        const hs = m.home_score ?? 0;
        const as = m.away_score ?? 0;
        if (m.status !== "finished") return;
        if (hs === as) {
          add(m.home_team, 1);
          add(m.away_team, 1);
        } else if (hs > as) {
          add(m.home_team, 3);
          add(m.away_team, 0);
        } else {
          add(m.home_team, 0);
          add(m.away_team, 3);
        }
      });

      const rows = [...table.entries()]
        .map(([name, points]) => ({ name, points }))
        .sort((a, b) => b.points - a.points)
        .slice(0, 6);

      setTeams(rows);
      setLoading(false);
    };
    run();
  }, []);

  return (
    <div className="p-5 bg-card rounded-2xl shadow border border-border/50">
      <h3 className="text-sm font-semibold mb-2">League Table (30d, pseudo)</h3>
      {loading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-10 bg-muted/40 rounded animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="divide-y divide-border/50">
          {teams.map((t, idx) => (
            <Row key={t.name} i={idx + 1} team={t} />
          ))}
        </div>
      )}
      <div className="mt-2 text-[11px] text-muted-foreground">
        * računa bodove iz završених utakmica u zadnjih 30 dana.
      </div>
    </div>
  );
}
