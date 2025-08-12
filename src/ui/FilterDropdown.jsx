// src/ui/FilterDropdown.jsx - REUSABLE DROPDOWN FOR FILTERS
import { useState, useRef, useEffect } from "react";
import { Icon } from "@iconify-icon/react";

export default function FilterDropdown({
  label,
  icon,
  value,
  options,
  onChange,
  className = "",
  variant = "default", // default, compact, large
  disabled = false,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [isOpen]);

  const currentOption =
    options.find((opt) => opt.value === value) || options[0];

  const getVariantClasses = () => {
    switch (variant) {
      case "compact":
        return "px-3 py-1.5 text-xs min-w-[120px]";
      case "large":
        return "px-5 py-3 text-base min-w-[180px]";
      default:
        return "px-4 py-2 text-sm min-w-[150px]";
    }
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Dropdown button */}
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`
          flex items-center justify-between gap-2 
          bg-muted hover:bg-muted/80 border border-border rounded-lg
          transition-all duration-200 font-medium
          focus:outline-none focus:ring-2 focus:ring-primary/50
          ${
            disabled
              ? "opacity-50 cursor-not-allowed"
              : "hover:scale-[1.02] active:scale-98"
          }
          ${isOpen ? "ring-2 ring-primary/50 bg-muted/80" : ""}
          ${getVariantClasses()}
        `}
        aria-label={`${label} filter`}
        aria-expanded={isOpen}
      >
        {/* Left side - icon and current selection */}
        <div className="flex items-center gap-2">
          {icon && (
            <span className="text-lg" role="img" aria-label={label}>
              {icon}
            </span>
          )}
          <div className="flex flex-col items-start">
            {variant !== "compact" && (
              <span className="text-xs text-muted-foreground font-normal">
                {label}
              </span>
            )}
            <span
              className={`${
                variant === "compact" ? "text-xs" : "text-sm"
              } font-medium`}
            >
              {currentOption.label}
            </span>
          </div>
        </div>

        {/* Right side - chevron */}
        <Icon
          icon="mdi:chevron-down"
          className={`transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
          width={16}
          height={16}
        />
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-background border border-border rounded-lg shadow-lg z-50 overflow-hidden">
          {options.map((option) => (
            <button
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              className={`
                w-full px-4 py-2.5 text-left flex items-center gap-3
                hover:bg-muted transition-colors
                ${
                  value === option.value
                    ? "bg-primary/10 text-primary border-r-2 border-primary"
                    : "text-foreground"
                }
                ${variant === "compact" ? "text-xs py-2" : "text-sm"}
              `}
            >
              {/* Option icon */}
              {option.icon && (
                <span className="text-lg flex-shrink-0" role="img">
                  {option.icon}
                </span>
              )}

              <div className="flex-1">
                {/* Option label */}
                <div className="font-medium">{option.label}</div>

                {/* Option description (if provided) */}
                {option.description && (
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {option.description}
                  </div>
                )}
              </div>

              {/* Badge (if provided) */}
              {option.badge && (
                <span className="bg-primary/20 text-primary px-2 py-0.5 rounded-full text-xs font-medium">
                  {option.badge}
                </span>
              )}

              {/* Check mark for selected */}
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

// Prebuilt filter configurations for common use cases

export const TIME_FILTER_OPTIONS = [
  {
    value: "selected",
    label: "Selected Date",
    icon: "📅",
    description: "Matches from selected date only",
  },
  {
    value: "today",
    label: "Today",
    icon: "🌅",
    description: "Matches from today",
  },
  {
    value: "yesterday",
    label: "Yesterday",
    icon: "🌆",
    description: "Matches from yesterday",
  },
  {
    value: "week",
    label: "This Week",
    icon: "📆",
    description: "Matches from past 7 days",
  },
  {
    value: "all",
    label: "All Time",
    icon: "🕐",
    description: "All available matches",
  },
];

export const PRIORITY_FILTER_OPTIONS = [
  {
    value: "all",
    label: "All Leagues",
    icon: "🌍",
    description: "Matches from all competitions",
  },
  {
    value: "top",
    label: "Top Leagues",
    icon: "⭐",
    description: "Premier League, La Liga, Serie A, etc.",
  },
  {
    value: "regional",
    label: "Regional",
    icon: "🏆",
    description: "National and regional leagues",
  },
];

export const RESULT_FILTER_OPTIONS = [
  {
    value: "all",
    label: "All Results",
    icon: "⚽",
    description: "All match results",
  },
  {
    value: "withGoals",
    label: "With Goals",
    icon: "🥅",
    description: "Matches with at least 1 goal",
  },
  {
    value: "draws",
    label: "Draws",
    icon: "🤝",
    description: "Matches that ended in a draw",
  },
  {
    value: "highScoring",
    label: "High Scoring",
    icon: "🔥",
    description: "3+ goals scored",
  },
];

export const UPCOMING_TIME_FILTER_OPTIONS = [
  {
    value: "selected",
    label: "Selected Date",
    icon: "📅",
    description: "Matches on selected date",
  },
  {
    value: "today",
    label: "Today",
    icon: "🌅",
    description: "Remaining matches today",
  },
  {
    value: "tomorrow",
    label: "Tomorrow",
    icon: "🌄",
    description: "Tomorrow's matches",
  },
  {
    value: "next24h",
    label: "Next 24h",
    icon: "⏰",
    description: "Matches in next 24 hours",
  },
  {
    value: "week",
    label: "This Week",
    icon: "📆",
    description: "Matches in next 7 days",
  },
  {
    value: "all",
    label: "All Upcoming",
    icon: "🕐",
    description: "All future matches",
  },
];
