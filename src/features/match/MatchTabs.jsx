// src/features/match/MatchTabs.jsx
import { useState } from "react";

const TABS = ["Overview", "Lineups", "Stats", "H2H", "Prediction"];

export default function MatchTabs({ children }) {
  const [active, setActive] = useState(TABS[0]);
  const current = Array.isArray(children)
    ? children.find((c) => c?.props?.id === active)
    : children;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setActive(t)}
            className={`rounded-full px-4 py-2 text-sm font-medium ${
              active === t
                ? "bg-primary text-primary-foreground"
                : "bg-zinc-800/70 text-zinc-300 hover:bg-zinc-700"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-white/10 bg-zinc-900/40 p-4 md:p-6">
        {current}
      </div>
    </div>
  );
}
