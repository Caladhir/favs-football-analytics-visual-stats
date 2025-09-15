// src/pages/app_layout/Dashboard.jsx - WITH EQUAL HEIGHTS
import React, { useState, useEffect } from "react";
import QuickStats from "../../features/dashboard/QuickStats";
import StatOfTheDay from "../../features/dashboard/StatOfTheDay";
import UpsetAlert from "../../features/dashboard/UpsetAlert";
import FormGuide from "../../features/dashboard/FormGuide";
import LiveResults from "../../features/dashboard/LiveResults";
import TopScorers from "../../features/dashboard/TopScorers";
import LeagueTable from "../../features/dashboard/LeagueTable";
import XgVsGoals from "../../features/dashboard/XgVsGoals";
import BestWorstPerformers from "../../features/dashboard/BestWorstPerformers";
import ActivityHeatmap from "../../features/dashboard/ActivityHeatmap";

// Animated Background Component
function AnimatedBackground() {
  return (
    <div className="fixed inset-0 z-0 overflow-hidden">
      {/* Floating football shapes */}
      <div className="absolute top-10 left-10 w-4 h-4 bg-red-500/20 rounded-full animate-ping animation-delay-1000" />
      <div className="absolute top-32 right-20 w-6 h-6 bg-white/10 rounded-full animate-bounce animation-delay-2000" />
      <div className="absolute bottom-40 left-32 w-5 h-5 bg-red-400/30 rounded-full animate-pulse animation-delay-3000" />
      <div className="absolute bottom-20 right-40 w-3 h-3 bg-white/20 rounded-full animate-ping animation-delay-4000" />

      {/* Moving gradient orbs */}
      <div className="absolute -top-40 -left-40 w-80 h-80 bg-gradient-to-br from-red-500/20 to-transparent rounded-full blur-3xl animate-spin-slow" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-gradient-to-tl from-red-600/15 to-transparent rounded-full blur-3xl animate-pulse" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-gradient-to-r from-red-500/10 to-white/5 rounded-full blur-2xl animate-spin-slow animation-reverse" />
    </div>
  );
}

// Enhanced Card Component with Equal Heights
function DashboardCard({ children, className = "", delay = 0 }) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <div
      className={`
        relative backdrop-blur-sm rounded-2xl shadow-xl border border-border/50 
        transition-all duration-700 ease-out hover:scale-[1.02] hover:shadow-2xl 
        hover:shadow-red-500/10 hover:border-red-500/30 group h-full
        ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}
        ${className}
      `}
    >
      {/* Subtle glow effect on hover */}
      <div className="absolute -inset-0.5 bg-gradient-to-r from-red-500/20 to-white/10 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-sm" />
      <div className="relative h-full">{children}</div>
    </div>
  );
}

// Live Status Indicator
function LiveStatusIndicator() {
  return (
    <div className="flex items-center justify-center mb-8">
      <div className="bg-gradient-to-r from-red-600 to-red-700 text-white px-6 py-3 rounded-full font-semibold text-sm flex items-center gap-3 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105">
        <div className="w-3 h-3 bg-white rounded-full animate-pulse" />
        Analytics Dashboard
        <div className="w-3 h-3 bg-white/70 rounded-full animate-ping" />
      </div>
    </div>
  );
}

// Section Header Component
function SectionHeader({ title, subtitle, icon }) {
  return (
    <div className="text-center mb-8">
      <div className="inline-flex items-center gap-3 mb-2">
        <span className="text-2xl">{icon}</span>
        <h2 className="text-2xl font-bold bg-gradient-to-r from-red-400 via-white to-red-400 bg-clip-text text-transparent">
          {title}
        </h2>
        <span className="text-2xl">{icon}</span>
      </div>
      {subtitle && (
        <p className="text-muted-foreground text-sm max-w-2xl mx-auto">
          {subtitle}
        </p>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Stagger the loading animation
    const timer = setTimeout(() => setIsLoaded(true), 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-red-950 text-white overflow-hidden relative">
      <AnimatedBackground />

      {/* Main Content */}
      <div className="relative z-10">
        {/* Hero Header */}
        <section
          className={`text-center pt-12 pb-8 px-4 transition-all duration-1000 ${
            isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          <div className="mb-6">
            <h1 className="font-black text-5xl md:text-6xl mb-2 text-red-500 animate-pulse-slow">
              Analytics Dashboard
            </h1>
            <p className="text-xl md:text-2xl text-gray-300 font-light tracking-wider">
              Overview of key metrics, trends & live data
            </p>
          </div>
          <LiveStatusIndicator />
        </section>

        <div className="container mx-auto px-6 pb-12 space-y-12">
          {/* Quick Stats - Hero Section */}
          <DashboardCard delay={200} className="p-2 bg-card/80">
            <QuickStats />
          </DashboardCard>

          {/* Insights Section - EQUAL HEIGHTS */}
          <section>
            <SectionHeader
              title="Current Insights"
              subtitle="Fresh performance data & trending statistics"
              icon="🔥"
            />
            <div
              className="grid grid-cols-1 md:grid-cols-3 gap-6"
              style={{ gridTemplateRows: "1fr" }}
            >
              <DashboardCard delay={300}>
                <StatOfTheDay />
              </DashboardCard>
              <DashboardCard delay={400}>
                <UpsetAlert />
              </DashboardCard>
              <DashboardCard delay={500}>
                <FormGuide />
              </DashboardCard>
            </div>
          </section>

          {/* Live Data Section - EQUAL HEIGHTS */}
          <section>
            <SectionHeader
              title="Live Tracking"
              subtitle="Matches in progress & top performers"
              icon="⚡"
            />
            <div
              className="grid grid-cols-1 lg:grid-cols-3 gap-6"
              style={{ gridTemplateRows: "1fr" }}
            >
              <DashboardCard delay={600} className="lg:col-span-2">
                <LiveResults />
              </DashboardCard>
              <DashboardCard delay={700}>
                <TopScorers />
              </DashboardCard>
            </div>
          </section>

          {/* Performance Analytics - EQUAL HEIGHTS */}
          <section>
            <SectionHeader
              title="Performance Analytics"
              subtitle="In-depth analysis of results & expected performance"
              icon="📈"
            />
            <div
              className="grid grid-cols-1 lg:grid-cols-2 gap-6"
              style={{ gridTemplateRows: "1fr" }}
            >
              <DashboardCard delay={800}>
                <LeagueTable />
              </DashboardCard>
              <DashboardCard delay={900}>
                <XgVsGoals />
              </DashboardCard>
            </div>
          </section>

          {/* Advanced Analytics - EQUAL HEIGHTS */}
          <section>
            <SectionHeader
              title="Advanced Analytics"
              subtitle="Detailed view of performance & activity over time"
              icon="🎯"
            />
            <div
              className="grid grid-cols-1 lg:grid-cols-2 gap-6"
              style={{ gridTemplateRows: "1fr" }}
            >
              <DashboardCard delay={1000}>
                <BestWorstPerformers />
              </DashboardCard>
              <DashboardCard delay={1100}>
                <ActivityHeatmap />
              </DashboardCard>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
