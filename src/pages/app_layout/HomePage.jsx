// src/pages/app_layout/HomePage.jsx - UPDATED WITH IMPROVEMENTS
import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import AnimatedBackground from "../../features/homepage/AnimatedBackground";
import LiveMatchTicker from "../../features/homepage/LiveMatchTicker";
import QuickStatsSection from "../../features/homepage/QuickStatsSection";
import FeaturesSection from "../../features/homepage/FeaturesSection";
import TrendingSection from "../../features/homepage/TrendingSection";

// Import button components
import Button from "../../ui/Button";
import { CTAButton } from "../../ui/SpecializedButtons";

export default function HomePage() {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setIsLoaded(true);
  }, []);

  return (
    <main
      className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-red-950 text-white overflow-x-hidden relative
    "
    >
      <AnimatedBackground />

      {/* Hero Section */}
      <section
        className={`relative z-10 text-center py-20 px-6 transition-all duration-1000 ${
          isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
        }`}
      >
        <div className="mb-8">
          <h1 className="font-black text-7xl md:text-8xl mb-4 text-red-500 animate-pulse-slow">
            F.A.V.S.
          </h1>
          <p className="text-xl md:text-2xl text-gray-300 font-light tracking-wider mb-2">
            Football Analytics & Visual Stats
          </p>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto">
            The most advanced platform for football data analysis with live
            tracking, detailed statistics, and AI predictions
          </p>
        </div>

        {/* CTA Button */}
        <Link to="/dashboard">
          <CTAButton>🚀 Start Analysis</CTAButton>
        </Link>
      </section>

      {/* Live Matches Ticker */}
      <LiveMatchTicker />

      {/* Quick Stats Cards */}
      <QuickStatsSection />

      {/* Feature Cards */}
      <FeaturesSection />

      {/* Trending Section */}
      <TrendingSection />

      {/* Footer CTA - ENHANCED */}
      <section className="relative z-10 py-20 px-6 -mx-6">
        <div className="bg-gradient-to-r from-red-950/30 via-gray-900/50 to-red-950/30 backdrop-blur-sm border-y border-red-500/20">
          <div className="container mx-auto max-w-4xl py-16">
            <div className="text-center mb-12">
              <h2 className="text-4xl md:text-5xl font-bold mb-6 bg-gradient-to-r from-red-400 via-white to-red-400 bg-clip-text text-transparent">
                Ready for Advanced Analysis?
              </h2>
              <p className="text-xl text-gray-300 mb-8">
                Join thousands of users who use F.A.V.S. for deep football
                analysis
              </p>

              {/* Main CTA Buttons */}
              {/* CTA buttons hidden per request */}
              {/* <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
                <Link to="/dashboard">
                  <CTAButton>Create Free Account</CTAButton>
                </Link>
                <Link to="/matches">
                  <Button variant="ghost" size="lg" leftIcon="mdi:play-circle-outline">
                    View Demo
                  </Button>
                </Link>
              </div> */}
            </div>

            {/* Feature Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="group bg-gradient-to-br from-gray-800/50 to-gray-900/70 backdrop-blur-sm rounded-2xl p-6 border border-red-500/20 hover:border-red-500/40 transition-all duration-300 hover:scale-105">
                <div className="text-center">
                  <div className="text-4xl mb-4 group-hover:animate-bounce">
                    ⚡
                  </div>
                  <h3 className="text-lg font-semibold mb-2 text-white group-hover:text-red-400 transition-colors">
                    Live Tracking
                  </h3>
                  <p className="text-gray-400 text-sm mb-4 group-hover:text-gray-300 transition-colors">
                    Track matches live with detailed statistics
                  </p>
                  <Link to="/matches/live">
                    <Button variant="outline" size="sm" fullWidth>
                      Watch Live
                    </Button>
                  </Link>
                </div>
              </div>

              <div className="group bg-gradient-to-br from-gray-800/50 to-gray-900/70 backdrop-blur-sm rounded-2xl p-6 border border-red-500/20 hover:border-red-500/40 transition-all duration-300 hover:scale-105">
                <div className="text-center">
                  <div className="text-4xl mb-4 group-hover:animate-bounce">
                    📊
                  </div>
                  <h3 className="text-lg font-semibold mb-2 text-white group-hover:text-red-400 transition-colors">
                    Analytics
                  </h3>
                  <p className="text-gray-400 text-sm mb-4 group-hover:text-gray-300 transition-colors">
                    Deep analysis of teams and players
                  </p>
                  <Link to="/teams">
                    <Button variant="outline" size="sm" fullWidth>
                      Explore Teams
                    </Button>
                  </Link>
                </div>
              </div>

              <div className="group bg-gradient-to-br from-gray-800/50 to-gray-900/70 backdrop-blur-sm rounded-2xl p-6 border border-red-500/20 hover:border-red-500/40 transition-all duration-300 hover:scale-105">
                <div className="text-center">
                  <div className="text-4xl mb-4 group-hover:animate-bounce">
                    🎯
                  </div>
                  <h3 className="text-lg font-semibold mb-2 text-white group-hover:text-red-400 transition-colors">
                    Predictions
                  </h3>
                  <p className="text-gray-400 text-sm mb-4 group-hover:text-gray-300 transition-colors">
                    AI predictions with high accuracy
                  </p>
                  <Button variant="outline" size="sm" fullWidth disabled>
                    Coming Soon
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
