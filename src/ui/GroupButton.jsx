// src/ui/GroupButton.jsx - REDESIGNED WITH MODERN STYLING
import React from "react";

export default function GroupButton({
  isGrouped,
  onToggle,
  size = "md",
  groupedText = "Grouped",
  ungroupedText = "Group",
  className = "",
  disabled = false,
  variant = "default", // default, minimal, modern
}) {
  const getSizeClasses = () => {
    switch (size) {
      case "sm":
        return "px-4 py-2 text-sm";
      case "lg":
        return "px-6 py-3 text-base";
      default:
        return "px-5 py-2.5 text-sm";
    }
  };

  const getVariantClasses = () => {
    if (disabled) {
      return "bg-gradient-to-r from-gray-600/50 to-gray-700/50 text-gray-400 cursor-not-allowed border-gray-600/30";
    }

    switch (variant) {
      case "minimal":
        return isGrouped
          ? "bg-gradient-to-r from-red-600/20 to-red-700/20 text-red-300 border-red-500/30 hover:from-red-600/30 hover:to-red-700/30"
          : "bg-gradient-to-r from-gray-700/20 to-gray-800/20 text-gray-300 border-gray-600/30 hover:from-gray-600/30 hover:to-gray-700/30";

      case "modern":
        return isGrouped
          ? "bg-gradient-to-r from-red-600/80 to-red-700/80 backdrop-blur-sm text-white border-red-500/30 hover:from-red-500/80 hover:to-red-600/80 shadow-lg shadow-red-500/20"
          : "bg-gradient-to-r from-gray-700/80 to-gray-800/80 backdrop-blur-sm text-white border-gray-600/30 hover:from-gray-600/80 hover:to-gray-700/80 shadow-lg shadow-gray-500/20";

      default:
        return isGrouped
          ? "bg-gradient-to-r from-red-600 to-red-700 text-white border-red-500/40 hover:from-red-500 hover:to-red-600 shadow-lg shadow-red-500/40"
          : "bg-gradient-to-r from-gray-600 to-gray-700 text-white border-gray-500/40 hover:from-gray-500 hover:to-gray-600 shadow-lg shadow-gray-500/40";
    }
  };

  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className={`
        group relative overflow-hidden font-semibold rounded-xl 
        transition-all duration-300 ease-out
        border focus:outline-none focus:ring-2 focus:ring-red-400/50
        transform hover:scale-105 active:scale-95 
        ${getSizeClasses()}
        ${getVariantClasses()}
        ${className}
      `}
      aria-pressed={isGrouped}
      aria-label={isGrouped ? ungroupedText : groupedText}
    >
      {/* Glow effect on hover */}
      <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      <span className="relative z-10 flex items-center gap-2">
        {/* Animated icon */}
        <span
          className={`transition-all duration-300 ease-out ${
            isGrouped ? "rotate-0 scale-110" : "rotate-180 scale-100"
          }`}
        >
          {isGrouped ? "📋" : "📄"}
        </span>

        {/* Text */}
        <span className="font-bold">
          {isGrouped ? groupedText : ungroupedText}
        </span>
      </span>
    </button>
  );
}

// Specijalizirane verzije
export function HeaderGroupButton({ isGrouped, onToggle }) {
  return (
    <GroupButton
      isGrouped={isGrouped}
      onToggle={onToggle}
      size="sm"
      variant="modern"
      groupedText="📋 Groups"
      ungroupedText="📄 Group"
      className="backdrop-blur-sm"
    />
  );
}

export function SidebarGroupButton({ isGrouped, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className={`
        group w-full p-4 rounded-xl font-semibold transition-all duration-300
        border focus:outline-none focus:ring-2 focus:ring-red-500/50
        flex items-center gap-4 relative overflow-hidden
        ${
          isGrouped
            ? "bg-gradient-to-r from-red-600/80 to-red-700/80 backdrop-blur-sm text-white border-red-500/30 shadow-lg shadow-red-500/20"
            : "bg-gradient-to-r from-gray-700/80 to-gray-800/80 backdrop-blur-sm text-white border-gray-600/30 shadow-lg shadow-gray-500/20"
        }
      `}
      aria-pressed={isGrouped}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      <span
        className={`text-2xl transition-transform duration-300 group-hover:scale-110 ${
          isGrouped ? "rotate-0" : "rotate-180"
        }`}
      >
        {isGrouped ? "📋" : "📄"}
      </span>

      <div className="flex-1 text-left relative z-10">
        <div className="font-bold">
          {isGrouped ? "Grouped view" : "List view"}
        </div>
        <div className="text-sm opacity-80">
          {isGrouped ? "Switch to list" : "Group by competition"}
        </div>
      </div>

      <div
        className={`w-3 h-3 rounded-full transition-all duration-300 ${
          isGrouped ? "bg-white animate-pulse" : "bg-gray-400"
        }`}
      />
    </button>
  );
}

export function FloatingGroupButton({ isGrouped, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className={`
        group fixed bottom-6 right-6 w-16 h-16 rounded-full
        font-bold transition-all duration-300 ease-out
        border-2 flex items-center justify-center relative overflow-hidden
        focus:outline-none focus:ring-4 focus:ring-red-400/50
        transform hover:scale-110 active:scale-95 
        shadow-2xl z-50 backdrop-blur-sm
        ${
          isGrouped
            ? "bg-gradient-to-r from-red-600 to-red-700 text-white border-red-400/50 shadow-red-500/40"
            : "bg-gradient-to-r from-gray-700 to-gray-800 text-white border-gray-500/50 shadow-gray-500/40"
        }
      `}
      aria-pressed={isGrouped}
      title={isGrouped ? "Switch to list view" : "Group by competition"}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-full" />

      <span
        className={`text-2xl transition-transform duration-300 relative z-10 ${
          isGrouped ? "rotate-0" : "rotate-180"
        }`}
      >
        {isGrouped ? "📋" : "📄"}
      </span>
    </button>
  );
}
