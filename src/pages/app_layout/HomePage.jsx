import { useEffect, useState } from "react";

export default function HomePage() {
  const [matches, setMatches] = useState([]);
  const [type, setType] = useState("live");

  useEffect(() => {
    const fetchMatches = async () => {
      try {
        const res = await fetch(
          `/${type === "live" ? "liveMatches" : "scheduledMatches"}.json`
        );
        const data = await res.json();
        setMatches(data);
      } catch (err) {
        console.error("Greška kod učitavanja podataka:", err);
      }
    };

    fetchMatches();
    const interval = setInterval(fetchMatches, 30000);
    return () => clearInterval(interval);
  }, [type]);

  const todayDate = new Date().toLocaleDateString("hr-HR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4 text-center">
        F.A.V.S. - Utakmice
      </h1>

      <div className="flex justify-center gap-4 mb-4">
        <button
          className={`px-4 py-2 rounded ${
            type === "live" ? "bg-red-700 text-white" : "bg-gray-300"
          }`}
          onClick={() => setType("live")}
        >
          Live
        </button>
        <button
          className={`px-4 py-2 rounded ${
            type === "scheduled" ? "bg-blue-700 text-white" : "bg-gray-300"
          }`}
          onClick={() => setType("scheduled")}
        >
          Današnje utakmice
        </button>
      </div>

      <ul className="space-y-2 max-w-md mx-auto">
        {matches.map((match) => (
          <li key={match.id} className="p-3 bg-gray-100 rounded shadow">
            <p
              className={`text-center font-bold ${
                match.date === todayDate ? "text-blue-700" : ""
              }`}
            >
              {match.date} {match.time} - {match.tournament}
            </p>

            <p className="text-center">
              {match.homeTeam} vs {match.awayTeam}
            </p>
            <div className="flex flex-col items-center justify-between mt-2 text-sm text-gray-700">
              <span
                className={`px-2 py-1 rounded ${
                  match.statusType === "inprogress"
                    ? "bg-red-100 text-red-700 font-bold"
                    : "bg-gray-300 text-gray-800"
                }`}
              >
                {match.statusType === "inprogress"
                  ? match.minute
                    ? `${match.minute}'`
                    : "U tijeku"
                  : match.status}
              </span>
              <span
                className={`font-bold ${
                  match.statusType === "inprogress"
                    ? "text-red-700"
                    : "text-black"
                }`}
              >
                {match.score}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
