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

export default function CalendarPopover({ date, setDate }) {
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
      base.setDate(base.getDate() + offset);
      console.log(`📅 Date change by ${offset}: ${ymd(base)}`);
      return base;
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
    console.log("📅 Calendar selected:", ymd(local));
    setDate(local);
    setOpen(false);
  };

  const handleTodayClick = () => {
    const today = toStartOfDay(new Date());
    setDate(today);
    setOpen(false);
  };

  return (
    <div className="relative flex items-center justify-center gap-1 mt-6 mb-4">
      <button
        onClick={() => handleChange(-1)}
        className="group flex items-center justify-center w-12 h-12 rounded-xl bg-border hover:bg-primary/50 hover:scale-105 transition-all"
        aria-label="Previous day"
      >
        <ChevronLeft className="w-6 h-6 text-primary group-hover:text-white transition-colors" />
      </button>

      <button
        onClick={() => setOpen(!open)}
        className="relative flex items-center gap-3 px-6 py-3 bg-gradient-to-b from-primary/80 to-accent/40 hover:from-primary hover:to-accent/80 text-foreground font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 min-w-[200px] justify-center"
      >
        <Calendar className="w-4 h-4" />
        <span className="text-sm">{getDateDisplayText()}</span>
        <div className="text-sm text-foreground/80">
          <span> ( {format(safeDate, "EEE")} ) </span>
        </div>
      </button>

      <button
        onClick={() => handleChange(1)}
        className="group flex items-center justify-center w-12 h-12 rounded-xl bg-border hover:bg-primary/50 hover:scale-105 transition-all"
        aria-label="Next day"
      >
        <ChevronRight className="w-6 h-6 text-primary group-hover:text-white transition-colors" />
      </button>

      {open && (
        <div
          ref={popoverRef}
          className="absolute mt-2 top-10 right-0 w-82 rounded-lg bg-background text-foreground shadow-lg border p-4 z-50"
        >
          <button
            onClick={() => setOpen(false)}
            className="absolute top-2 right-3 text-muted-foreground hover:text-foreground transition-colors"
          >
            ✕
          </button>

          <DayPicker
            mode="single"
            selected={safeDate}
            onSelect={handleDateSelect}
            weekStartsOn={1}
            showOutsideDays
            modifiersClassNames={{
              selected: "rdp-day_selected",
              today: "rdp-day_today",
            }}
          />

          <button
            onClick={handleTodayClick}
            className="block w-1/2 mx-auto text-center mt-3 bg-primary hover:bg-accent text-primary-foreground font-semibold py-1 rounded transition-colors duration-200"
          >
            TODAY
          </button>
        </div>
      )}
    </div>
  );
}
