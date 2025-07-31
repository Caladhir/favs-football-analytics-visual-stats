// components/Tabs/LiveMatches.jsx
import { useEffect, useState } from "react";

export default function LiveMatches() {
  const [matches, setMatches] = useState([]);

  useEffect(() => {
    const fetchMatches = async () => {
      try {
        const res = await fetch("/liveMatches.json");
        const data = await res.json();
        setMatches(data);
      } catch (err) {
        console.error("Greška kod učitavanja podataka:", err);
      }
    };

    fetchMatches();
    const interval = setInterval(fetchMatches, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <ul className="space-y-2 max-w-md mx-auto">
      {matches.map((match) => (
        <li key={match.id} className="p-3 bg-gray-100 rounded shadow">
          <p className="text-center font-bold">
            {match.date} {match.time} - {match.tournament}
          </p>
          <p className="text-center">
            {match.homeTeam} vs {match.awayTeam}
          </p>
          <div className="flex flex-col items-center justify-between mt-2 text-sm text-gray-700">
            <span className="px-2 py-1 rounded bg-red-100 text-red-700 font-bold">
              {match.minute ? `${match.minute}'` : "U tijeku"}
            </span>
            <span className="font-bold text-red-700">{match.score}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
