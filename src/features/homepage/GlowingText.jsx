// src/features/homepage/GlowingText.jsx - ENHANCED GLOW EFFECT
import React from "react";

export default function GlowingText({ children, className = "" }) {
  return (
    <span className={`relative inline-block ${className}`}>
      {/* Main text */}
      <span className="relative z-10 bg-gradient-to-r from-red-400 via-white to-red-400 bg-clip-text text-transparent font-bold">
        {children}
      </span>

      {/* Glow effect layers */}
      <span
        className="absolute inset-0 bg-gradient-to-r from-red-400 via-white to-red-400 bg-clip-text text-transparent blur-sm opacity-70 animate-pulse"
        aria-hidden="true"
      >
        {children}
      </span>

      {/* Secondary glow */}
      <span
        className="absolute inset-0 bg-gradient-to-r from-red-500 to-red-600 bg-clip-text text-transparent blur-md opacity-30 animate-pulse"
        style={{ animationDelay: "0.5s" }}
        aria-hidden="true"
      >
        {children}
      </span>

      {/* Outer glow */}
      <span
        className="absolute inset-0 bg-red-500 blur-lg opacity-20 animate-pulse rounded"
        style={{ animationDelay: "1s", filter: "blur(12px)" }}
        aria-hidden="true"
      />
    </span>
  );
}
