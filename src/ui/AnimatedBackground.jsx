// src/components/shared/AnimatedBackground.jsx
import React from "react";

export default function AnimatedBackground({
  theme = "default",
  intensity = "normal",
}) {
  // Theme variations
  const themes = {
    default: {
      primary: "blue-500",
      secondary: "red-500",
      accent: "white",
    },
    teams: {
      primary: "blue-500",
      secondary: "green-600",
      accent: "white",
    },
    dashboard: {
      primary: "red-500",
      secondary: "red-600",
      accent: "white",
    },
    matches: {
      primary: "purple-500",
      secondary: "pink-500",
      accent: "white",
    },
  };

  // Intensity variations
  const intensities = {
    subtle: {
      opacity: "10",
      size: "sm",
    },
    normal: {
      opacity: "20",
      size: "md",
    },
    bold: {
      opacity: "30",
      size: "lg",
    },
  };

  const currentTheme = themes[theme] || themes.default;
  const currentIntensity = intensities[intensity] || intensities.normal;

  return (
    <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
      {/* Floating particles */}
      <div
        className={`absolute top-20 left-16 w-3 h-3 bg-${currentTheme.primary}/${currentIntensity.opacity} rounded-full animate-ping animation-delay-1000`}
      />
      <div
        className={`absolute top-40 right-24 w-5 h-5 bg-${currentTheme.accent}/10 rounded-full animate-bounce animation-delay-2000`}
      />
      <div
        className={`absolute bottom-32 left-20 w-4 h-4 bg-${currentTheme.primary}/30 rounded-full animate-pulse animation-delay-3000`}
      />
      <div
        className={`absolute bottom-16 right-32 w-2 h-2 bg-${currentTheme.accent}/${currentIntensity.opacity} rounded-full animate-ping animation-delay-4000`}
      />

      {/* Additional particles for higher intensity */}
      {intensity === "bold" && (
        <>
          <div
            className={`absolute top-1/4 left-1/4 w-2 h-2 bg-${currentTheme.secondary}/20 rounded-full animate-pulse animation-delay-500`}
          />
          <div
            className={`absolute bottom-1/4 right-1/4 w-3 h-3 bg-${currentTheme.primary}/15 rounded-full animate-bounce animation-delay-1500`}
          />
        </>
      )}

      {/* Large gradient orbs */}
      <div
        className={`absolute -top-40 -left-40 w-80 h-80 bg-gradient-to-br from-${currentTheme.primary}/15 to-transparent rounded-full blur-3xl animate-spin-slow`}
      />
      <div
        className={`absolute -bottom-40 -right-40 w-96 h-96 bg-gradient-to-tl from-${currentTheme.secondary}/10 to-transparent rounded-full blur-3xl animate-pulse`}
      />
      <div
        className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-gradient-to-r from-${currentTheme.primary}/10 to-${currentTheme.secondary}/10 rounded-full blur-2xl animate-spin-slow animation-reverse`}
      />
    </div>
  );
}
