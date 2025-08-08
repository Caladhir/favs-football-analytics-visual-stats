// pages/app_layout/HomePage.jsx
import { Button } from "../../ui/Button"; // prilagodi path
import { QuickLink } from "../../features/homepage/QuickLink";
import { FeatureCard } from "../../features/homepage/FeatureCard";
import { TrendingPlayers } from "../../features/homepage/TrendingPlayers";
import { HotPredictions } from "../../features/homepage/HotPredictions";
import { StatCard } from "../../features/homepage/StatCard";

import { Link } from "react-router-dom";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Hero sekcija */}
      <section className="text-center py-16 px-4">
        <h1 className="font-black text-5xl text-primary text-outline">
          F.A.V.S.
        </h1>
        <p className="text-muted-foreground mt-1 text-lg ">
          Football Analytics & Visual Stats
        </p>
        <Link to="/dashboard">
          <Button className="mt-6 px-6 py-3 text-md">Počni Analizu</Button>
        </Link>
      </section>

      {/* Brzi linkovi */}
      <section className="flex flex-wrap justify-center gap-4 px-4">
        <QuickLink title="Moji Timovi" />
        <QuickLink title="Predikcije" />
        <QuickLink title="Lige" />
      </section>

      {/* Ključne funkcionalnosti */}
      <section className="py-16 px-4">
        <h2 className="text-2xl font-bold text-center mb-8">
          Ključne Funkcionalnosti
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
          <FeatureCard
            title="Praćenje Timova"
            desc="Dodaj omiljene timove i prati njihove performanse."
          />
          <FeatureCard
            title="xG Analiza"
            desc="Očekivani golovi, shot mapa i napredne statistike."
          />
          <FeatureCard
            title="Analiza Igrača"
            desc="Detaljne statistike performansi i usporedbe."
          />
        </div>
      </section>

      {/* Trending */}
      <section className="bg-muted py-16 px-4">
        <h2 className="text-2xl font-bold text-center mb-8">
          Trending Analitika
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto">
          <TrendingPlayers />
          <HotPredictions />
        </div>
      </section>

      {/* Statistika */}
      <section className="py-16 px-4 text-center">
        <h2 className="text-2xl font-bold mb-6">Trenutne Statistike</h2>
        <div className="flex flex-wrap justify-center gap-10 text-2xl font-semibold">
          <StatCard number="180+" label="Analizirane Utakmice" />
          <StatCard number="12" label="HNL Timova" />
          <StatCard number="300+" label="Praćenih Igrača" />
          <StatCard number="95%" label="Točnost Podataka" />
        </div>
      </section>
    </div>
  );
}
