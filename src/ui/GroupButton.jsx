// src/ui/GroupButton.jsx - ENHANCED verzija s naprednim stilovima
import React from "react";

export default function GroupButton({
  isGrouped,
  onToggle,
  size = "md",
  groupedText = "Grouped",
  ungroupedText = "Group",
  className = "",
  disabled = false,
  variant = "default", // default, minimal, vibrant
}) {
  const getSizeClasses = () => {
    switch (size) {
      case "sm":
        return "px-3 py-1.5 text-xs";
      case "lg":
        return "px-5 py-3 text-base";
      default:
        return "px-4 py-2 text-sm";
    }
  };

  const getVariantClasses = () => {
    if (disabled) {
      return "bg-gray-300 text-gray-500 cursor-not-allowed hover:scale-100 active:scale-100 border-gray-300";
    }

    switch (variant) {
      case "minimal":
        return isGrouped
          ? "bg-blue-100 text-blue-700 border-blue-300 hover:bg-blue-200"
          : "bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200";

      case "vibrant":
        return isGrouped
          ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white border-purple-400 shadow-purple-500/25 hover:from-purple-600 hover:to-pink-600"
          : "bg-gradient-to-r from-gray-700 to-gray-800 text-white border-gray-600 shadow-gray-500/25 hover:from-gray-800 hover:to-gray-900";

      default:
        return isGrouped
          ? "bg-gradient-to-r from-green-500 to-green-600 text-white border-green-400 shadow-green-500/25 hover:from-green-600 hover:to-green-700"
          : "bg-gradient-to-r from-gray-600 to-gray-700 text-white border-gray-500 shadow-gray-500/25 hover:from-gray-700 hover:to-gray-800";
    }
  };

  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className={`
        relative overflow-hidden font-semibold rounded-full 
        transition-all duration-300 ease-out
        border-2 focus:outline-none focus:ring-3 focus:ring-blue-400/50
        transform hover:scale-105 active:scale-95 
        shadow-lg hover:shadow-xl
        ${getSizeClasses()}
        ${getVariantClasses()}
        ${className}
      `}
      aria-pressed={isGrouped}
      aria-label={isGrouped ? ungroupedText : groupedText}
    >
      {/* Animated background ripple effect */}
      <span className="absolute inset-0 bg-white/20 rounded-full scale-0 transition-transform duration-300 group-hover:scale-100" />

      <span className="relative flex items-center gap-2">
        {/* Animated icon */}
        <span
          className={`
          transition-all duration-300 ease-out
          ${isGrouped ? "rotate-0 scale-110" : "rotate-180 scale-100"}
        `}
        >
          {isGrouped ? "📋" : "📝"}
        </span>

        {/* Text with slide animation */}
        <span className="relative overflow-hidden">
          <span
            className={`
            block transition-transform duration-300 ease-out
            ${isGrouped ? "translate-y-0" : "translate-y-0"}
          `}
          >
            {isGrouped ? groupedText : ungroupedText}
          </span>
        </span>

        {/* Click indicator with pulse */}
        <span
          className={`
          text-xs transition-all duration-300
          ${variant === "minimal" ? "opacity-60" : "opacity-70"}
          hover:opacity-100 animate-pulse
        `}
        >
          👆
        </span>
      </span>

      {/* Hover glow effect */}
      <span
        className={`
        absolute inset-0 rounded-full opacity-0 transition-opacity duration-300
        hover:opacity-100 pointer-events-none
        ${
          isGrouped
            ? "shadow-[0_0_20px_rgba(34,197,94,0.4)]"
            : "shadow-[0_0_20px_rgba(107,114,128,0.4)]"
        }
      `}
      />
    </button>
  );
}

// Specijalizirane verzije za različite kontekste

// Za header/navigation
export function HeaderGroupButton({ isGrouped, onToggle }) {
  return (
    <GroupButton
      isGrouped={isGrouped}
      onToggle={onToggle}
      size="sm"
      variant="minimal"
      groupedText="📋 Groups"
      ungroupedText="📝 Group"
      className="backdrop-blur-sm bg-white/10"
    />
  );
}

// Za sidebar
export function SidebarGroupButton({ isGrouped, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className={`
        w-full p-3 rounded-lg font-medium transition-all duration-200
        border-2 focus:outline-none focus:ring-2 focus:ring-blue-500
        flex items-center gap-3 group
        ${
          isGrouped
            ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
            : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
        }
      `}
      aria-pressed={isGrouped}
    >
      <span
        className={`
        text-xl transition-transform duration-200 group-hover:scale-110
        ${isGrouped ? "rotate-0" : "rotate-180"}
      `}
      >
        {isGrouped ? "📋" : ""}
      </span>

      <span className="flex-1 text-left">
        {isGrouped ? "Grouped view" : "List view"}
      </span>

      <span className="text-xs opacity-60 group-hover:opacity-100">
        {isGrouped ? "Switch to list" : "Group items"}
      </span>
    </button>
  );
}

// Za floating action button
export function FloatingGroupButton({ isGrouped, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className={`
        fixed bottom-6 right-6 w-14 h-14 rounded-full
        font-medium transition-all duration-300 ease-out
        border-2 flex items-center justify-center
        focus:outline-none focus:ring-4 focus:ring-blue-400/50
        transform hover:scale-110 active:scale-95 
        shadow-xl hover:shadow-2xl z-50
        ${
          isGrouped
            ? "bg-green-500 text-white border-green-400 shadow-green-500/25"
            : "bg-blue-500 text-white border-blue-400 shadow-blue-500/25"
        }
      `}
      aria-pressed={isGrouped}
      title={isGrouped ? "Switch to list view" : "Group by competition"}
    >
      <span
        className={`
        text-lg transition-transform duration-300
        ${isGrouped ? "rotate-0" : "rotate-180"}
      `}
      >
        {isGrouped ? "📋" : "📝"}
      </span>
    </button>
  );
}

// Utility funkcija za className kombiniranje ako je potrebna
export function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}
