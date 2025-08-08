// src/pages/Matches.jsx
import { useState } from "react";
import AllMatches from "../../features/tabs/AllMatches";
import LiveMatches from "../../features/tabs/LiveMatches";
import UpcomingMatches from "../../features/tabs/UpcomingMatches";
import FinishedMatches from "../../features/tabs/FinishedMatches";

const TABS = {
  all: <AllMatches />,
  live: <LiveMatches />,
  upcoming: <UpcomingMatches />,
  finished: <FinishedMatches />,
};

export default function Matches() {
  const [tab, setTab] = useState("all");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <section className="text-center mt-4">
        <h1 className="text-4xl font-black text-primary text-outline">
          Matches
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Follow matches by status
        </p>
      </section>

      <div className="flex justify-center gap-2 mt-8 mb-6 flex-wrap">
        {Object.keys(TABS).map((key) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 rounded font-medium hover:bg-primary/50 hover:scale-[1.02] transition-all duration-300 ease-in-out ${
              tab === key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {key.charAt(0).toUpperCase() + key.slice(1)}
          </button>
        ))}
      </div>

      {TABS[tab]}
    </div>
  );
}
