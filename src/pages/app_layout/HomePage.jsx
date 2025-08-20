// src/pages/app_layout/HomePage.jsx - KOMPLETNO AŽURIRANO S NOVIM BUTTON KOMPONENTAMA
import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import AnimatedBackground from "../../features/homepage/AnimatedBackground";
import LiveMatchTicker from "../../features/homepage/LiveMatchTicker";
import QuickStatsSection from "../../features/homepage/QuickStatsSection";
import FeaturesSection from "../../features/homepage/FeaturesSection";
import TrendingSection from "../../features/homepage/TrendingSection";

// Import novih button komponenti
import Button from "../../ui/Button"; // DEFAULT IMPORT
import { CTAButton } from "../../ui/SpecializedButtons"; // NAMED IMPORT
export default function HomePage() {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setIsLoaded(true);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-red-950 text-white overflow-hidden relative">
      <AnimatedBackground />

      {/* Hero Section */}
      <section
        className={`relative z-10 text-center py-20 px-4 transition-all duration-1000 ${
          isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
        }`}
      >
        <div className="mb-8">
          <h1 className="font-black text-7xl md:text-8xl mb-4 text-red-500 animate-pulse-slow">
            F.A.V.S.
          </h1>
          <p className="text-xl md:text-2xl text-gray-300 font-light tracking-wider">
            Football Analytics & Visual Stats
          </p>
        </div>

        {/* CTA Button with new component */}
        <Link to="/dashboard">
          <CTAButton>Počni Analizu</CTAButton>
        </Link>
      </section>

      {/* Live Matches Ticker - Pravi podaci */}
      <LiveMatchTicker />

      {/* Quick Stats Cards - Pravi podaci */}
      <QuickStatsSection />

      {/* Feature Cards - Statične */}
      <FeaturesSection />

      {/* Trending Section - Pravi podaci */}
      <TrendingSection />

      {/* Footer CTA - KOMPLETNO AŽURIRANO */}
      <section className="relative z-10 text-center py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold mb-6 bg-gradient-to-r from-red-400 via-white to-red-400 bg-clip-text text-transparent">
            Spremni za Naprednu Analizu?
          </h2>
          <p className="text-xl text-gray-300 mb-8">
            Pridruži se tisućama korisnika koji koriste F.A.V.S. za bolje
            razumijevanje nogometa
          </p>

          {/* Ažurirani buttons s novim komponentama */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/dashboard">
              <CTAButton>Kreiraj Besplatan Račun</CTAButton>
            </Link>

            <Link to="/matches">
              <Button
                variant="ghost"
                size="lg"
                leftIcon="mdi:play-circle-outline"
              >
                Pregledaj Demo
              </Button>
            </Link>
          </div>

          {/* Dodatni CTA section */}
          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10 hover:border-red-500/30 transition-colors">
              <div className="text-3xl mb-3">⚡</div>
              <h3 className="text-lg font-semibold mb-2">Live Praćenje</h3>
              <p className="text-gray-400 text-sm mb-4">
                Prati utakmice uživo s detaljnim statistikama
              </p>
              <Link to="/matches/live">
                <Button variant="outline" size="sm" fullWidth>
                  Pogledaj Live
                </Button>
              </Link>
            </div>

            <div className="bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10 hover:border-red-500/30 transition-colors">
              <div className="text-3xl mb-3">📊</div>
              <h3 className="text-lg font-semibold mb-2">Analitika</h3>
              <p className="text-gray-400 text-sm mb-4">
                Dubinska analiza timova i igrača
              </p>
              <Link to="/teams">
                <Button variant="outline" size="sm" fullWidth>
                  Istraži Timove
                </Button>
              </Link>
            </div>

            <div className="bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10 hover:border-red-500/30 transition-colors">
              <div className="text-3xl mb-3">🎯</div>
              <h3 className="text-lg font-semibold mb-2">Predviđanja</h3>
              <p className="text-gray-400 text-sm mb-4">
                AI predikcije s visokom preciznošću
              </p>
              <Button variant="outline" size="sm" fullWidth disabled>
                Uskoro
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
