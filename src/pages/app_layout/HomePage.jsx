// ============================================
// src/pages/app_layout/HomePage.jsx
// ============================================
import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import AnimatedBackground from "../../features/homepage/AnimatedBackground";
import GlowingText from "../../features/homepage/GlowingText";
import LiveMatchTicker from "../../features/homepage/LiveMatchTicker";
import QuickStatsSection from "../../features/homepage/QuickStatsSection";
import FeaturesSection from "../../features/homepage/FeaturesSection";
import TrendingSection from "../../features/homepage/TrendingSection";

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

        {/* CTA Button with Hover Effect */}
        <Link to="/dashboard">
          <button className="group relative px-8 py-4 bg-gradient-to-r from-red-600 to-red-700 rounded-full font-semibold text-lg overflow-hidden transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-red-500/50">
            <span className="relative z-10">Počni Analizu</span>
            <div className="absolute inset-0 bg-gradient-to-r from-red-700 to-red-800 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <div className="absolute -inset-1 bg-gradient-to-r from-red-500 to-red-600 rounded-full blur opacity-30 group-hover:opacity-50 transition-opacity duration-300" />
          </button>
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

      {/* Footer CTA */}
      <section className="relative z-10 text-center py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold mb-6 bg-gradient-to-r from-red-400 via-white to-red-400 bg-clip-text text-transparent">
            Spremni za Naprednu Analizu?
          </h2>
          <p className="text-xl text-gray-300 mb-8">
            Pridruži se tisućama korisnika koji koriste F.A.V.S. za bolje
            razumijevanje nogometa
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/dashboard">
              <button className="px-8 py-4 bg-red-600 hover:bg-red-700 rounded-full font-semibold text-lg transition-all duration-300 hover:scale-105">
                Kreiraj Besplatan Račun
              </button>
            </Link>
            <Link to="/matches">
              <button className="px-8 py-4 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-full font-semibold text-lg border border-white/20 transition-all duration-300 hover:scale-105">
                Pregledaj Demo
              </button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
