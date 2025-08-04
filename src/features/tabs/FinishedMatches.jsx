import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

export default function FinishedMatches() {
  const [matches, setMatches] = useState([]);

  useEffect(() => {
    const fetchMatches = async () => {
      try {
        const res = await fetch("/scheduledMatches.json");
        const data = await res.json();
        const finished = data.filter(
          (match) => match.statusType === "finished"
        );
        setMatches(finished);
      } catch (err) {
        console.error("Greška kod učitavanja podataka:", err);
      }
    };
    fetchMatches();
    const interval = setInterval(fetchMatches, 30000);
    return () => clearInterval(interval);
  }, []);

  if (matches.length === 0)
    return (
      <p className="text-center mt-8 text-muted-foreground">
        No finished matches.
      </p>
    );

  return (
    <ul className="space-y-2 max-w-md mx-auto">
      {matches.map((match) => (
        <li key={match.id} className="p-3 bg-muted rounded shadow">
          <Link to={`/match/${match.id}`}>
            <p className="text-center font-bold text-muted-foreground">
              {match.date} {match.time} - {match.tournament}
            </p>
            <p className="text-center text-foreground">
              {match.homeTeam}{" "}
              <span className="text-accent text-outline text-center mr-1">
                vs
              </span>
              {match.awayTeam}
            </p>
            <div className="flex justify-center mt-2 text-sm text-muted-foreground">
              <span className="font-bold text-secondary">{match.score}</span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
