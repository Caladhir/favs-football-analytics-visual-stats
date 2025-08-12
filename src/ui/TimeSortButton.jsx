// src/ui/TimeSortButton.jsx - REUSABLE TIME SORTING BUTTON
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
    label: "Time ⏰",
    icon: "⏰",
    description: "Earliest matches first",
    iconName: "mdi:clock-outline",
  },
  {
    value: "reverse-chronological",
    label: "Time ⏰↓",
    icon: "⏰",
    description: "Latest matches first",
    iconName: "mdi:clock-end",
  },
];

export default function TimeSortButton({
  value = "smart",
  onChange,
  className = "",
  size = "sm", // xs, sm, md, lg
  variant = "default", // default, minimal, pill
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
        return "px-2 py-1 text-xs gap-1";
      case "sm":
        return "px-3 py-1.5 text-xs gap-1.5";
      case "md":
        return "px-4 py-2 text-sm gap-2";
      case "lg":
        return "px-5 py-3 text-base gap-2";
      default:
        return "px-3 py-1.5 text-xs gap-1.5";
    }
  };

  const getVariantClasses = () => {
    if (disabled) {
      return "bg-gray-300 text-gray-500 cursor-not-allowed border-gray-300";
    }

    switch (variant) {
      case "minimal":
        return "bg-transparent border border-border hover:bg-muted";
      case "pill":
        return "bg-muted hover:bg-muted/80 rounded-full border border-border";
      default:
        return "bg-muted hover:bg-muted/80 border border-border rounded-lg";
    }
  };

  const handleOptionSelect = (newValue) => {
    onChange(newValue);
    setIsOpen(false);
  };

  const toggleSort = () => {
    if (disabled) return;

    // Cycle through options
    const currentIndex = TIME_SORT_OPTIONS.findIndex(
      (opt) => opt.value === value
    );
    const nextIndex = (currentIndex + 1) % TIME_SORT_OPTIONS.length;
    onChange(TIME_SORT_OPTIONS[nextIndex].value);
  };

  return (
    <div className={`relative inline-block ${className}`}>
      {/* Main button - cycles through options on click */}
      <button
        onClick={toggleSort}
        disabled={disabled}
        className={`
          flex items-center font-medium transition-all duration-200
          focus:outline-none focus:ring-2 focus:ring-primary/50
          hover:scale-[1.02] active:scale-98
          ${getSizeClasses()}
          ${getVariantClasses()}
        `}
        title={currentOption.description}
        aria-label={`Time sorting: ${currentOption.label}`}
      >
        {/* Icon */}
        <Icon
          icon={currentOption.iconName}
          className={`
            transition-transform duration-200
            ${value === "reverse-chronological" ? "rotate-180" : ""}
          `}
          width={size === "xs" ? 14 : size === "lg" ? 20 : 16}
          height={size === "xs" ? 14 : size === "lg" ? 20 : 16}
        />

        {/* Label */}
        {showLabel && (
          <span className="font-medium">
            {size === "xs" ? currentOption.icon : currentOption.label}
          </span>
        )}

        {/* Cycle indicator */}
        <Icon
          icon="mdi:chevron-right"
          className="opacity-60"
          width={12}
          height={12}
        />
      </button>

      {/* Dropdown menu (for right-click or long press) */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 bg-background border border-border rounded-lg shadow-lg z-50 min-w-[200px] overflow-hidden">
          {TIME_SORT_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => handleOptionSelect(option.value)}
              className={`
                w-full px-3 py-2.5 text-left flex items-center gap-3
                hover:bg-muted transition-colors
                ${
                  value === option.value
                    ? "bg-primary/10 text-primary border-r-2 border-primary"
                    : "text-foreground"
                }
              `}
            >
              <Icon
                icon={option.iconName}
                width={16}
                height={16}
                className={
                  value === option.value &&
                  option.value === "reverse-chronological"
                    ? "rotate-180"
                    : ""
                }
              />

              <div className="flex-1">
                <div className="font-medium text-sm">{option.label}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {option.description}
                </div>
              </div>

              {value === option.value && (
                <Icon
                  icon="mdi:check"
                  className="text-primary"
                  width={16}
                  height={16}
                />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Specialized variants for different contexts

export function HeaderTimeSortButton({ value, onChange }) {
  return (
    <TimeSortButton
      value={value}
      onChange={onChange}
      size="sm"
      variant="minimal"
      className="backdrop-blur-sm bg-white/10"
    />
  );
}

export function CompactTimeSortButton({ value, onChange }) {
  return (
    <TimeSortButton
      value={value}
      onChange={onChange}
      size="xs"
      variant="pill"
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
        variant="pill"
        className="shadow-xl bg-background/90 backdrop-blur-md"
      />
    </div>
  );
}

// Utility function to apply time sorting to matches
export function applyTimeSort(matches, sortType) {
  if (!matches || matches.length === 0) return matches;

  switch (sortType) {
    case "chronological":
      // Earliest first
      return [...matches].sort(
        (a, b) => new Date(a.start_time) - new Date(b.start_time)
      );

    case "reverse-chronological":
      // Latest first
      return [...matches].sort(
        (a, b) => new Date(b.start_time) - new Date(a.start_time)
      );

    case "smart":
    default:
      // Keep existing smart sorting (don't change the order)
      return matches;
  }
}

// Export for use in sorting utils
export { TIME_SORT_OPTIONS };
