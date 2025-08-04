import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

export default function LiveMatches() {
  const [matches, setMatches] = useState([]);
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));

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
    const interval = setInterval(fetchMatches, 30000); // osvježava podatke svakih 30s
    return () => clearInterval(interval);
  }, []);

  // lokalni timer koji se povećava u sekundi
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const renderMinute = (match) => {
    if (
      match.statusType === "inprogress" &&
      match.currentPeriodStartTimestamp
    ) {
      const diffSec = now - match.currentPeriodStartTimestamp;
      let minute = Math.floor(diffSec / 60);
      if (minute > 45 && minute <= 60) {
        minute = `45+${minute - 45}`;
      } else if (minute > 90 && minute <= 105) {
        minute = `90+${minute - 90}`;
      } else {
        minute = `${minute + 1}`;
      }

      return (
        <span className="relative flex items-center justify-center">
          <span>{minute}</span>
          <span className="absolute  -right-1 top-0 text-xs animate-pulse">
            ′
          </span>
        </span>
      );
    }

    if (match.statusType === "halftime") return "HT";
    if (match.statusType === "finished") return "FT";
    if (match.statusType === "penalties") return "PEN";

    return match.status;
  };

  if (matches.length === 0)
    return (
      <p className="text-center mt-8 text-muted-foreground">
        Currently there are no live matches.
      </p>
    );

  return (
    <ul className="space-y-2 max-w-md mx-auto ">
      {matches.map((match) => (
        <li key={match.id} className="p-3 bg-muted rounded shadow">
          <Link to={`/match/${match.id}`}>
            <p className="text-center font-bold text-primary">
              {match.date} {match.time} - {match.tournament}
            </p>
            <p className="text-center text-foreground">
              {match.homeTeam}{" "}
              <span className="text-accent text-outline text-center mr-1 ">
                vs
              </span>
              {match.awayTeam}
            </p>{" "}
            <div className="flex flex-col items-center justify-between mt-2 text-sm text-muted-foreground">
              <span className="px-2 py-1 rounded bg-destructive text-destructive-foreground font-bold min-w-[40px] text-center">
                {renderMinute(match)}
              </span>
              <span className="font-bold text-lg text-primary">
                {match.score}
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
