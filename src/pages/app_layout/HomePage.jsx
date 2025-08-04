import { useState } from "react";
import AllMatches from "../../components/Tabs/AllMatches";
import LiveMatches from "../../components/Tabs/LiveMatches";

export default function HomePage() {
  const [tab, setTab] = useState("all");

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Hero sekcija s logom */}
      <section className="text-center mt-4">
        <h1 className="text-3xl font-bold text-primary text-outline">
          F.A.V.S.
        </h1>
        <p className="text-muted-foreground mt-1 text-sm ">
          Football Analytics & Visual Stats
        </p>
      </section>

      {/* Tab Navigacija */}
      <div className="flex justify-center gap-2 mt-8 mb-6">
        <button
          className={`px-4 py-2 rounded-full font-semibold text-sm transition ${
            tab === "all"
              ? "bg-primary text-destructive-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80 "
          }`}
          onClick={() => setTab("all")}
        >
          All
        </button>
        <button
          className={`px-4 py-2 rounded-full font-semibold text-sm transition ${
            tab === "live"
              ? "bg-destructive text-destructive-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
          onClick={() => setTab("live")}
        >
          Live
        </button>
      </div>

      {/* Prikaz Tab Sadržaja */}
      <div className="px-4">
        {tab === "all" && <AllMatches />}
        {tab === "live" && <LiveMatches />}
      </div>
    </div>
  );
}
