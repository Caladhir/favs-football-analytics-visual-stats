// src/ui/TimeSortButton.jsx - REDESIGNED WITH MODERN STYLING
import { useState } from "react";
import { Icon } from "@iconify-icon/react";

const TIME_SORT_OPTIONS = [
  {
    value: "smart",
    label: "Smart Sort",
    icon: "🤖",
    description: "Priority-based sorting (leagues, status, favorites)",
    iconName: "mdi:auto-fix",
  },
  {
    value: "chronological",
    label: "Earliest First",
    icon: "⏰",
    description: "Earliest matches first",
    iconName: "mdi:clock-outline",
  },
  {
    value: "reverse-chronological",
    label: "Latest First",
    icon: "⏰",
    description: "Latest matches first",
    iconName: "mdi:clock-end",
  },
];

export default function TimeSortButton({
  value = "smart",
  onChange,
  className = "",
  size = "sm",
  variant = "default",
  disabled = false,
  showLabel = true,
}) {
  const [isOpen, setIsOpen] = useState(false);

  const currentOption =
    TIME_SORT_OPTIONS.find((opt) => opt.value === value) ||
    TIME_SORT_OPTIONS[0];

  const getSizeClasses = () => {
    switch (size) {
      case "xs":
        return "px-3 py-1.5 text-xs gap-2";
      case "sm":
        return "px-4 py-2 text-sm gap-2";
      case "md":
        return "px-5 py-2.5 text-sm gap-2";
      case "lg":
        return "px-6 py-3 text-base gap-3";
      default:
        return "px-4 py-2 text-sm gap-2";
    }
  };

  const getVariantClasses = () => {
    if (disabled) {
      return "bg-gradient-to-r from-gray-600/50 to-gray-700/50 text-gray-400 cursor-not-allowed border-gray-600/30";
    }

    switch (variant) {
      case "minimal":
        return "bg-gradient-to-r from-blue-600/20 to-blue-700/20 backdrop-blur-sm text-blue-300 border-blue-500/30 hover:from-blue-600/30 hover:to-blue-700/30";
      case "modern":
        return "bg-gradient-to-r from-blue-600/80 to-blue-700/80 backdrop-blur-sm text-white border-blue-500/30 hover:from-blue-500/80 hover:to-blue-600/80 shadow-lg shadow-blue-500/20";
      default:
        return "bg-gradient-to-r from-blue-600 to-blue-700 text-white border-blue-500/40 hover:from-blue-500 hover:to-blue-600 shadow-lg shadow-blue-500/40";
    }
  };

  const toggleSort = () => {
    if (disabled) return;

    const currentIndex = TIME_SORT_OPTIONS.findIndex(
      (opt) => opt.value === value
    );
    const nextIndex = (currentIndex + 1) % TIME_SORT_OPTIONS.length;
    onChange(TIME_SORT_OPTIONS[nextIndex].value);
  };

  const handleOptionSelect = (newValue) => {
    onChange(newValue);
    setIsOpen(false);
  };

  return (
    <div className={`relative inline-block ${className}`}>
      {/* Main button */}
      <button
        onClick={toggleSort}
        onContextMenu={(e) => {
          e.preventDefault();
          setIsOpen(!isOpen);
        }}
        disabled={disabled}
        className={`
          group relative overflow-hidden font-semibold rounded-xl
          transition-all duration-300 ease-out flex items-center
          border focus:outline-none focus:ring-2 focus:ring-blue-400/50
          hover:scale-105 active:scale-95
          ${getSizeClasses()}
          ${getVariantClasses()}
        `}
        title={`${currentOption.description} (Right-click for options)`}
        aria-label={`Time sorting: ${currentOption.label}`}
      >
        {/* Glow effect */}
        <div className="absolute rounded-full inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        <span className="relative z-10 flex items-center gap-2">
          {/* Icon with rotation animation */}
          <Icon
            icon={currentOption.iconName}
            className={`transition-transform duration-300 ${
              value === "reverse-chronological" ? "rotate-180" : ""
            }`}
            width={size === "xs" ? 16 : size === "lg" ? 20 : 18}
            height={size === "xs" ? 16 : size === "lg" ? 20 : 18}
          />

          {/* Label */}
          {showLabel && (
            <span className="font-bold">
              {size === "xs" ? currentOption.icon : currentOption.label}
            </span>
          )}

          {/* Cycle indicator */}
          <Icon
            icon="mdi:chevron-right"
            className="opacity-60 group-hover:opacity-100 transition-opacity duration-300"
            width={14}
            height={14}
          />
        </span>
      </button>

      {/* Enhanced dropdown menu */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown */}
          <div className="absolute top-full left-0 mt-2 bg-gradient-to-br from-gray-900/95 to-black/95 backdrop-blur-xl border border-blue-500/30 rounded-2xl shadow-2xl shadow-blue-500/20 z-50 min-w-[280px] overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 border-b border-gray-700/50 bg-gradient-to-r from-blue-600/20 to-transparent">
              <h3 className="font-bold text-white text-sm">Sort Options</h3>
              <p className="text-xs text-gray-400 mt-1">
                Choose how to order matches
              </p>
            </div>

            {/* Options */}
            <div className="py-2">
              {TIME_SORT_OPTIONS.map((option, index) => (
                <button
                  key={option.value}
                  onClick={() => handleOptionSelect(option.value)}
                  className={`
                    group w-full px-4 py-3 text-left flex items-center gap-3
                    transition-all duration-200 relative overflow-hidden
                    ${
                      value === option.value
                        ? "bg-gradient-to-r from-blue-600/20 to-blue-700/10 text-blue-300 border-r-2 border-blue-400"
                        : "text-gray-300 hover:bg-gradient-to-r hover:from-gray-800/50 hover:to-gray-700/30"
                    }
                  `}
                >
                  {/* Hover effect */}
                  <div className="absolute inset-0 bg-gradient-to-r from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />

                  {/* Icon */}
                  <div className="relative z-10">
                    <Icon
                      icon={option.iconName}
                      width={18}
                      height={18}
                      className={`transition-transform duration-300 ${
                        value === option.value &&
                        option.value === "reverse-chronological"
                          ? "rotate-180"
                          : ""
                      }`}
                    />
                  </div>

                  {/* Content */}
                  <div className="flex-1 relative z-10">
                    <div className="font-semibold text-sm flex items-center gap-2">
                      {option.label}
                      {option.value === "smart" && (
                        <span className="text-xs bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full">
                          Recommended
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5 leading-relaxed">
                      {option.description}
                    </div>
                  </div>

                  {/* Selection indicator */}
                  {value === option.value && (
                    <div className="relative z-10">
                      <Icon
                        icon="mdi:check-circle"
                        className="text-blue-400 animate-pulse"
                        width={18}
                        height={18}
                      />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Specijalizirane verzije
export function HeaderTimeSortButton({ value, onChange }) {
  return (
    <TimeSortButton
      value={value}
      onChange={onChange}
      size="sm"
      variant="modern"
      className="backdrop-blur-sm"
    />
  );
}

export function CompactTimeSortButton({ value, onChange }) {
  return (
    <TimeSortButton
      value={value}
      onChange={onChange}
      size="xs"
      variant="minimal"
      showLabel={false}
    />
  );
}

export function FloatingTimeSortButton({ value, onChange }) {
  return (
    <div className="fixed bottom-20 right-6 z-40">
      <TimeSortButton
        value={value}
        onChange={onChange}
        size="md"
        variant="modern"
        className="shadow-2xl backdrop-blur-xl"
      />
    </div>
  );
}

// Utility function to apply time sorting
export function applyTimeSort(matches, sortType) {
  if (!matches || matches.length === 0) return matches;

  switch (sortType) {
    case "chronological":
      return [...matches].sort(
        (a, b) => new Date(a.start_time) - new Date(b.start_time)
      );

    case "reverse-chronological":
      return [...matches].sort(
        (a, b) => new Date(b.start_time) - new Date(a.start_time)
      );

    case "smart":
    default:
      return matches;
  }
}

export { TIME_SORT_OPTIONS };
