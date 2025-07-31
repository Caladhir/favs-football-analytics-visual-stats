import { useState } from "react";
import Header from "../../components/Header";
import AllMatches from "../../components/Tabs/AllMatches";
import LiveMatches from "../../components/Tabs/LiveMatches";

export default function HomePage() {
  const [tab, setTab] = useState("all");

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Hero sekcija s logom */}
      <section className="text-center mt-8">
        <img
          src="/public/favs-logo.svg"
          alt="F.A.V.S. Logo"
          className="mx-auto w-40 h-40 object-contain mb-4"
        />
        <h1 className="text-3xl font-bold">F.A.V.S. - Utakmice</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Football Analytics & Visual Stats
        </p>
      </section>

      {/* Tab Navigacija */}
      <div className="flex justify-center gap-2 mt-8 mb-6">
        <button
          className={`px-4 py-2 rounded-full font-semibold text-sm ${
            tab === "all" ? "bg-black text-white" : "bg-gray-200"
          }`}
          onClick={() => setTab("all")}
        >
          All
        </button>
        <button
          className={`px-4 py-2 rounded-full font-semibold text-sm ${
            tab === "live" ? "bg-red-600 text-white" : "bg-gray-200"
          }`}
          onClick={() => setTab("live")}
        >
          Live
        </button>
        {/* Ovdje možeš dodati i Upcoming, Finished... */}
      </div>

      {/* Prikaz Tab Sadržaja */}
      <div className="px-4">
        {tab === "all" && <AllMatches />}
        {tab === "live" && <LiveMatches />}
      </div>
    </div>
  );
}
