// components/Tabs/AllMatches.jsx
import { useEffect, useState } from "react";

export default function AllMatches() {
  const [matches, setMatches] = useState([]);

  useEffect(() => {
    const fetchMatches = async () => {
      try {
        const res = await fetch("/scheduledMatches.json");
        const data = await res.json();
        setMatches(data);
      } catch (err) {
        console.error("Greška kod učitavanja podataka:", err);
      }
    };

    fetchMatches();
  }, []);

  const todayDate =
    new Date().toLocaleDateString("hr-HR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }) + ".";

  return (
    <ul className="space-y-2 max-w-md mx-auto">
      {matches.map((match) => (
        <li key={match.id} className="p-3 bg-muted rounded shadow">
          <p
            className={`text-center font-bold ${
              match.date === todayDate
                ? "text-primary"
                : "text-muted-foreground"
            }`}
          >
            {match.date} {match.time} - {match.tournament}
          </p>
          <p className="text-center text-foreground">
            {match.homeTeam} vs {match.awayTeam}
          </p>
          <div className="flex flex-col items-center justify-between mt-2 text-sm text-muted-foreground">
            <span className="bg-accent text-accent-foreground px-2 py-1 rounded">
              {match.status}
            </span>
            <span className="font-bold text-foreground">{match.score}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
