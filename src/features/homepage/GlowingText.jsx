// src/features/homepage/GlowingText.jsx
// ============================================
import React from "react";

export default function GlowingText({ children, className = "" }) {
  return (
    <span className={`relative inline-block ${className}`}>
      <span className="relative z-10">{children}</span>
      <span
        className="absolute inset-0 blur-lg opacity-50 animate-pulse"
        style={{
          background: "linear-gradient(to right, #ef4444, #dc2626)",
          WebkitBackgroundClip: "text",
        }}
      />
    </span>
  );
}
