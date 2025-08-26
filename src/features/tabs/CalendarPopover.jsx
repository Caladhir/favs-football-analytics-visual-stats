// src/features/tabs/CalendarPopover.jsx - REDESIGNED WITH MODERN STYLING
import { useState, useRef, useEffect } from "react";
import { DayPicker } from "react-day-picker";
import { format, isValid as isValidDate, parseISO } from "date-fns";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";

/* Normalize any input to a valid local Date at start of day */
function toStartOfDay(value) {
  let d = null;

  if (value instanceof Date) d = new Date(value.getTime());
  else if (typeof value === "string") {
    d = /^\d{4}-\d{2}-\d{2}/.test(value) ? parseISO(value) : new Date(value);
  } else if (typeof value === "number") d = new Date(value);

  if (!d || !isValidDate(d)) d = new Date();

  d.setHours(0, 0, 0, 0);
  return d;
}

function ymd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function CalendarPopover({
  date,
  setDate,
  maxDateToday = false,
}) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef(null);

  const safeDate = toStartOfDay(date);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    const handleEscape = (e) => e.key === "Escape" && setOpen(false);
    if (open) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [open]);

  const handleChange = (offset) => {
    setDate((prev) => {
      const base = toStartOfDay(prev);
      const newDate = new Date(base);
      newDate.setDate(base.getDate() + offset);

      // Validate against maxDateToday if enabled
      if (maxDateToday) {
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        if (newDate > today) {
          return base; // Don't change if it would exceed today
        }
      }

      console.log(`📅 Date change by ${offset}: ${ymd(newDate)}`);
      return newDate;
    });
  };

  const getDateDisplayText = () => {
    const today = toStartOfDay(new Date());
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    if (safeDate.getTime() === today.getTime()) return "Today";
    if (safeDate.getTime() === yesterday.getTime()) return "Yesterday";
    if (safeDate.getTime() === tomorrow.getTime()) return "Tomorrow";
    return format(safeDate, "dd.MM.");
  };

  const handleDateSelect = (selected) => {
    if (!selected) return;
    const local = toStartOfDay(selected);

    // Validate against maxDateToday if enabled
    if (maxDateToday) {
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      if (local > today) {
        return; // Don't select future dates
      }
    }

    console.log("📅 Calendar selected:", ymd(local));
    setDate(local);
    setOpen(false);
  };

  const handleTodayClick = () => {
    const today = toStartOfDay(new Date());
    setDate(today);
    setOpen(false);
  };

  // Check if we can navigate forward
  const canGoForward = () => {
    if (!maxDateToday) return true;
    const nextDay = new Date(safeDate);
    nextDay.setDate(nextDay.getDate() + 1);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    return nextDay <= today;
  };

  return (
    <div className="relative flex items-center justify-center gap-3 mt-8 mb-6">
      {/* Previous Day Button */}
      <button
        onClick={() => handleChange(-1)}
        className="group relative overflow-hidden flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-gray-800/60 to-gray-900/80 backdrop-blur-sm border border-red-500/20 hover:border-red-500/40 hover:scale-110 transition-all duration-300 shadow-lg hover:shadow-2xl hover:shadow-red-500/20"
        aria-label="Previous day"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-red-500/10 to-red-600/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        <ChevronLeft className="w-6 h-6 text-red-400 group-hover:text-white transition-colors relative z-10" />
      </button>

      {/* Main Date Button */}
      <button
        onClick={() => setOpen(!open)}
        className="group relative overflow-hidden flex items-center gap-4 px-8 py-4 bg-gradient-to-br from-red-600/80 via-red-500/70 to-red-700/80 hover:from-red-500 hover:via-red-400 hover:to-red-600 text-white font-bold rounded-2xl shadow-lg hover:shadow-2xl hover:shadow-red-500/40 transition-all duration-300 hover:scale-105 min-w-[280px] justify-center backdrop-blur-sm border border-red-400/30"
      >
        {/* Background glow effect */}
        <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        <Calendar className="w-5 h-5 relative z-10 group-hover:animate-bounce" />
        <div className="text-center relative z-10">
          <div className="text-lg font-bold">{getDateDisplayText()}</div>
          <div className="text-sm text-red-100 opacity-90">
            {format(safeDate, "EEE, dd MMM yyyy")}
          </div>
        </div>

        {/* Dropdown indicator */}
        <div
          className={`transition-transform duration-300 relative z-10 ${
            open ? "rotate-180" : ""
          }`}
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </button>

      {/* Next Day Button */}
      <button
        onClick={() => handleChange(1)}
        disabled={!canGoForward()}
        className={`group relative overflow-hidden flex items-center justify-center w-14 h-14 rounded-2xl backdrop-blur-sm border transition-all duration-300 shadow-lg ${
          canGoForward()
            ? "bg-gradient-to-br from-gray-800/60 to-gray-900/80 border-red-500/20 hover:border-red-500/40 hover:scale-110 hover:shadow-2xl hover:shadow-red-500/20"
            : "bg-gradient-to-br from-gray-700/40 to-gray-800/60 border-gray-600/30 cursor-not-allowed opacity-50"
        }`}
        aria-label="Next day"
      >
        <div
          className={`absolute inset-0 bg-gradient-to-r from-red-500/10 to-red-600/10 opacity-0 transition-opacity duration-300 ${
            canGoForward() ? "group-hover:opacity-100" : ""
          }`}
        />
        <ChevronRight
          className={`w-6 h-6 transition-colors relative z-10 ${
            canGoForward()
              ? "text-red-400 group-hover:text-white"
              : "text-gray-500"
          }`}
        />
      </button>

      {/* Enhanced Calendar Popover */}
      {open && (
        <div
          ref={popoverRef}
          className="absolute mt-4 top-full left-1/2 -translate-x-1/2 w-96 rounded-2xl bg-gradient-to-br from-gray-900/95 to-black/95 backdrop-blur-xl text-white shadow-2xl border border-red-500/30 p-6 z-50"
        >
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-red-400">Select Date</h3>
            <button
              onClick={() => setOpen(false)}
              className="text-gray-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-gray-700/50"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Calendar */}
          <div className="mb-6">
            <DayPicker
              mode="single"
              selected={safeDate}
              onSelect={handleDateSelect}
              weekStartsOn={1}
              showOutsideDays
              disabled={maxDateToday ? { after: new Date() } : undefined}
              className="rdp-custom"
              modifiersClassNames={{
                selected: "rdp-day_selected",
                today: "rdp-day_today",
                disabled: "rdp-day_disabled",
              }}
            />
          </div>

          {/* Quick Actions */}
          <div className="flex gap-3">
            <button
              onClick={handleTodayClick}
              className="flex-1 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-200 hover:scale-105 shadow-lg"
            >
              📅 Today
            </button>

            <button
              onClick={() => {
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                setDate(toStartOfDay(yesterday));
                setOpen(false);
              }}
              className="flex-1 bg-gradient-to-r from-gray-700 to-gray-800 hover:from-gray-600 hover:to-gray-700 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-200 hover:scale-105 shadow-lg"
            >
              🌅 Yesterday
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
