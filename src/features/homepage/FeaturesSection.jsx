// src/features/homepage/FeaturesSection.jsx - ENHANCED WITH MODERN STYLING
import React from "react";
import GlowingText from "./GlowingText";

export default function FeaturesSection() {
  const features = [
    {
      title: "AI Predictions",
      desc: "Machine learning algorithms for accurate match outcome forecasting",
      icon: "🤖",
      gradient: "from-purple-500/20 to-pink-500/20",
      hoverGradient: "from-purple-500 to-pink-500",
    },
    {
      title: "Live Tracking",
      desc: "Real-time match monitoring with instant updates and statistics",
      icon: "📡",
      gradient: "from-blue-500/20 to-cyan-500/20",
      hoverGradient: "from-blue-500 to-cyan-500",
    },
    {
      title: "Player Analytics",
      desc: "Detailed player statistics, performance metrics and comparisons",
      icon: "👤",
      gradient: "from-green-500/20 to-emerald-500/20",
      hoverGradient: "from-green-500 to-emerald-500",
    },
    {
      title: "Heat Maps",
      desc: "Advanced visualization of player movements and game dynamics",
      icon: "🗺️",
      gradient: "from-orange-500/20 to-red-500/20",
      hoverGradient: "from-orange-500 to-red-500",
    },
  ];

  return (
    <section className="relative z-10 px-6 py-16">
      <div className="container mx-auto max-w-7xl">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            <GlowingText>Advanced Features</GlowingText>
          </h2>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto">
            Everything you need for comprehensive football analysis
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {features.map((feature, index) => (
            <div
              key={index}
              className="group relative cursor-pointer"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              {/* Main card */}
              <div
                className={`relative h-full p-8 bg-gradient-to-br ${feature.gradient} backdrop-blur-sm rounded-3xl border border-white/10 hover:border-red-500/40 transition-all duration-500 hover:scale-105 hover:shadow-2xl hover:shadow-red-500/20`}
              >
                {/* Hover gradient overlay */}
                <div
                  className={`absolute inset-0 bg-gradient-to-br ${feature.hoverGradient} opacity-0 group-hover:opacity-10 rounded-3xl transition-opacity duration-500`}
                />

                {/* Content */}
                <div className="relative">
                  {/* Icon */}
                  <div className="text-5xl md:text-6xl mb-6 group-hover:scale-110 transition-transform duration-300">
                    {feature.icon}
                  </div>

                  {/* Title */}
                  <h3 className="text-xl md:text-2xl font-bold mb-4 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent group-hover:from-red-300 group-hover:to-white transition-all duration-300">
                    {feature.title}
                  </h3>

                  {/* Description */}
                  <p className="text-gray-400 leading-relaxed group-hover:text-gray-300 transition-colors duration-300">
                    {feature.desc}
                  </p>

                  {/* Action indicator */}
                  <div className="mt-6 flex items-center text-sm text-red-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <span>Explore feature</span>
                    <svg
                      className="w-4 h-4 ml-2 transform group-hover:translate-x-1 transition-transform duration-300"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </div>
                </div>

                {/* Glow effect */}
                <div className="absolute -inset-0.5 bg-gradient-to-r from-red-500 to-red-600 rounded-3xl opacity-0 group-hover:opacity-20 blur transition-opacity duration-500 -z-10" />
              </div>

              {/* Background decoration */}
              <div className="absolute -top-4 -right-4 w-24 h-24 bg-gradient-to-br from-red-500/10 to-transparent rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 -z-10" />
            </div>
          ))}
        </div>

        {/* Bottom CTA */}
        <div className="text-center mt-16">
          <p className="text-gray-400 mb-6">
            Ready to experience the future of football analytics?
          </p>
          <div className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-red-500/20 to-red-600/20 border border-red-500/30 rounded-full text-red-300 hover:text-white hover:bg-red-500/30 transition-all duration-300 cursor-pointer">
            <span className="font-semibold">Get Started Today</span>
            <svg
              className="w-5 h-5 ml-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 7l5 5m0 0l-5 5m5-5H6"
              />
            </svg>
          </div>
        </div>
      </div>
    </section>
  );
}
