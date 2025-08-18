// src/features/homepage/FeaturesSection.jsx
// ============================================
import React from "react";
import GlowingText from "./GlowingText";

export default function FeaturesSection() {
  const features = [
    {
      title: "AI Predikcije",
      desc: "Machine learning algoritmi za predviđanje rezultata",
      icon: "🤖",
      gradient: "from-purple-500 to-pink-500",
    },
    {
      title: "Live Tracking",
      desc: "Praćenje utakmica u stvarnom vremenu",
      icon: "📡",
      gradient: "from-blue-500 to-cyan-500",
    },
    {
      title: "Heat Maps",
      desc: "Vizualizacija kretanja i akcija igrača",
      icon: "🗺️",
      gradient: "from-orange-500 to-red-500",
    },
  ];

  return (
    <section className="relative z-10 px-6 py-16">
      <h2 className="text-4xl font-bold text-center mb-12">
        <GlowingText>Napredne Funkcionalnosti</GlowingText>
      </h2>

      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
        {features.map((feature, i) => (
          <div
            key={i}
            className="group relative p-8 bg-gradient-to-br from-black/60 to-black/40 backdrop-blur-lg rounded-3xl border border-white/10 hover:border-white/30 transition-all duration-500 hover:-translate-y-2"
            style={{ animationDelay: `${i * 0.1}s` }}
          >
            <div
              className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} opacity-0 group-hover:opacity-10 rounded-3xl transition-opacity duration-500`}
            />

            <div className="relative">
              <div className="text-5xl mb-4 group-hover:scale-110 transition-transform duration-300">
                {feature.icon}
              </div>
              <h3 className="text-2xl font-bold mb-3 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
                {feature.title}
              </h3>
              <p className="text-gray-400 leading-relaxed">{feature.desc}</p>
            </div>

            <div className="absolute -inset-0.5 bg-gradient-to-r from-red-500 to-red-600 rounded-3xl opacity-0 group-hover:opacity-20 blur transition-opacity duration-500" />
          </div>
        ))}
      </div>
    </section>
  );
}
