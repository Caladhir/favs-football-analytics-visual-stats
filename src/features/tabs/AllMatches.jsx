import { useState } from "react";
import useMatchesByDate from "../../hooks/useMatchesByDate";
import DateSelector from "./DateSelector";
import { Link } from "react-router-dom";

export default function AllMatches() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const { matches, loading } = useMatchesByDate(selectedDate);

  return (
    <div>
      <DateSelector date={selectedDate} setDate={setSelectedDate} />

      {loading ? (
        <p className="text-center text-muted-foreground mt-6">Loading...</p>
      ) : matches.length === 0 ? (
        <p className="text-center text-muted-foreground mt-6">
          No matches on this day.
        </p>
      ) : (
        <ul className="space-y-2 max-w-md mx-auto">
          {matches.map((match) => {
            const isLive = match.status_type === "inprogress";
            const textStyle = isLive
              ? "text-primary font-bold"
              : "text-muted-foreground";
            const statusBadge = isLive
              ? "bg-destructive text-destructive-foreground"
              : "bg-accent text-muted-foreground";

            return (
              <li key={match.id} className="p-3 bg-muted rounded shadow">
                <Link to={`/match/${match.id}`}>
                  <p className={`text-center ${textStyle}`}>
                    {match.start_time.slice(0, 10)} - {match.competition}
                  </p>
                  <p className="text-center text-foreground">
                    {match.home_team}
                    <span className="mx-1 text-accent">vs</span>
                    {match.away_team}
                  </p>
                  <div className="flex flex-col items-center justify-between mt-2 text-sm">
                    <span
                      className={`px-2 py-1 rounded font-semibold ${statusBadge}`}
                    >
                      {match.minute !== null && match.minute !== undefined
                        ? `${match.minute}'`
                        : match.status}
                    </span>
                    <span
                      className={`font-bold ${
                        isLive ? "text-primary" : "text-muted-foreground"
                      }`}
                    >
                      {match.home_score} - {match.away_score}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
