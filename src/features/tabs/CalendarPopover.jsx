// src/components/CalendarPopover.jsx - REFINIRANI S VAŠIM DIZAJNOM
import { useState, useRef, useEffect } from "react";
import { DayPicker } from "react-day-picker";
import { format, addDays, isToday, isYesterday, isTomorrow } from "date-fns";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";

export default function CalendarPopover({ date, setDate }) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef(null);

  // Zatvaranje kalendara na click izvan
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  // Escape key za zatvaranje
  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    if (open) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [open]);

  const handleChange = (offset) => {
    setDate((prev) => addDays(prev, offset));
  };

  const getDateDisplayText = () => {
    if (isToday(date)) return "Today";
    if (isYesterday(date)) return "Yesterday";
    if (isTomorrow(date)) return "Tomorrow";
    return format(date, "dd.MM.");
  };

  return (
    <div className="relative flex items-center justify-center gap-1 mt-6 mb-4">
      {/* Prethodnji dan - vaš dizajn s Lucide ikonama */}
      <button
        onClick={() => handleChange(-1)}
        className="group flex items-center justify-center w-12 h-12 rounded-xl bg-border hover:bg-primary/50 hover:scale-105 transition-all "
        aria-label="Previous day"
      >
        <ChevronLeft className="w-6 h-6 text-primary group-hover:text-white transition-colors" />
      </button>

      {/* Glavni datum button - vaš stil s gradijentom koji odgovara vašoj paleti */}
      <button
        onClick={() => setOpen(!open)}
        className="relative flex items-center gap-3 px-6 py-3 bg-gradient-to-b from-primary/80 to-accent/40 hover:from-primary hover:to-accent/80 text-foreground font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 min-w-[200px] justify-center"
      >
        <Calendar className="w-4 h-4" />
        <span className="text-sm">{getDateDisplayText()}</span>
        <div className="text-sm text-foreground/80">
          <span> ( {format(date, "EEE")} ) </span>
        </div>
      </button>

      <button
        onClick={() => handleChange(1)}
        className="group flex items-center justify-center w-12 h-12 rounded-xl bg-border hover:bg-primary/50 hover:scale-105 transition-all "
        aria-label="Next day"
      >
        <ChevronRight className="w-6 h-6 text-primary group-hover:text-white transition-colors" />
      </button>

      {/* KALENDAR */}
      {open && (
        <div
          ref={popoverRef}
          className="absolute mt-2 top-10 right-0 w-82 rounded-lg bg-background text-foreground shadow-lg border p-4 z-50"
        >
          <div className="flex justify-between items-center mb-2">
            <button
              onClick={() => setOpen(false)}
              className="absolute top-2 right-3 text-muted-foreground hover:text-foreground transition-colors"
            >
              ✕
            </button>
          </div>

          <DayPicker
            mode="single"
            selected={date}
            onSelect={(selected) => {
              if (selected) {
                setDate(selected);
                setOpen(false);
              }
            }}
            weekStartsOn={1}
            showOutsideDays
            modifiersClassNames={{
              selected: "rdp-day_selected",
              today: "rdp-day_today",
            }}
          />

          <button
            onClick={() => {
              setDate(new Date());
              setOpen(false);
            }}
            className="block w-1/2 mx-auto text-center mt-3 bg-primary hover:bg-accent text-primary-foreground font-semibold py-1 rounded transition-colors duration-200"
          >
            TODAY
          </button>
        </div>
      )}
    </div>
  );
}
