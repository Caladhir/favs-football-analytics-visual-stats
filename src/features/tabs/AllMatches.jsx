// src/features/tabs/AllMatches.jsx
import { useState } from "react";
import useMatchesByDate from "../../hooks/useMatchesByDate";
import CalendarPopover from "./CalendarPopover";
import { Link } from "react-router-dom";
import { formatMatchTime } from "../../utils/formatMatchTime";

export default function AllMatches() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const { matches, loading } = useMatchesByDate(selectedDate);

  return (
    <div>
      <div className="flex justify-center my-4 gap-4">
        <CalendarPopover date={selectedDate} setDate={setSelectedDate} />
      </div>

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
            const isUpcoming = match.status_type === "notstarted";
            const isFinished = match.status_type === "finished";

            const { formattedDate, formattedTime } = formatMatchTime(
              match.start_time
            );

            const statusBadge = isLive
              ? "bg-destructive text-destructive-foreground"
              : isFinished
              ? "bg-red-700 text-white"
              : isUpcoming
              ? "bg-yellow-600 text-white"
              : "bg-muted text-muted-foreground";

            const showMinute =
              match.minute !== null && match.minute !== undefined;
            let statusText = "";

            if (match.status === "ht") statusText = "HT";
            else if (match.status === "afterextra") statusText = "ET";
            else if (match.status === "penalties") statusText = "PEN";
            else if (match.status === "cancelled") statusText = "Cancelled";
            else if (match.status === "postponed") statusText = "Postponed";
            else if (match.status === "abandoned") statusText = "Abandoned";
            else if (match.status === "live") {
              if (showMinute && match.minute >= 120) statusText = "120+'";
              else if (showMinute) statusText = `${match.minute}'`;
              else statusText = "Live";
            } else if (match.status === "finished") statusText = "FT";
            else
              statusText =
                match.status.charAt(0).toUpperCase() + match.status.slice(1);

            const scoreText = `${match.home_score ?? "-"} - ${
              match.away_score ?? "-"
            }`;

            return (
              <li key={match.id} className="p-3 bg-muted rounded shadow">
                <Link to={`/match/${match.id}`}>
                  <p className="text-sm text-center  mb-1">
                    <span
                      className={`text-sm text-center mb-1 ${
                        isLive
                          ? "text-primary font-semibold"
                          : "text-muted-foreground"
                      }`}
                    >
                      {formattedDate} {formattedTime}{" "}
                    </span>
                    – {match.competition}
                  </p>

                  <p className="text-center text-foreground font-medium">
                    {match.home_team}
                    <span className="mx-1 text-accent">vs</span>
                    {match.away_team}
                  </p>

                  <div className="flex flex-col items-center justify-between mt-2 text-sm">
                    <span
                      className={`px-2 py-1 rounded font-semibold ${statusBadge}`}
                    >
                      {statusText.charAt(0).toUpperCase() + statusText.slice(1)}
                    </span>

                    <span
                      className={`font-bold mt-1  ${
                        isLive
                          ? "text-primary"
                          : isFinished
                          ? "bg-muted text-[hsl(var(--muted-foreground))]"
                          : "text-accent-foreground"
                      }`}
                    >
                      {scoreText}
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
