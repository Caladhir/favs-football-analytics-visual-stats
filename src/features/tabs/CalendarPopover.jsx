// src/components/CalendarPopover.jsx
import { useState, useRef, useEffect } from "react";
import { DayPicker } from "react-day-picker";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";

// 🔧 HELPER: Stvori lokalni datum bez timezone problema
function createLocalDate(year, month, day) {
  const date = new Date();
  date.setFullYear(year, month, day);
  date.setHours(0, 0, 0, 0);
  return date;
}

// 🔧 HELPER: Dobij lokalni datum string za usporedbu
function getLocalDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

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

  // 🔧 ISPRAVLJENA: Promjena datuma s lokalnim vremenom
  const handleChange = (offset) => {
    setDate((prev) => {
      const newDate = new Date(prev);
      newDate.setDate(newDate.getDate() + offset);
      // Osiguraj da je vrijeme postavljeno na početak dana
      newDate.setHours(0, 0, 0, 0);

      console.log(`📅 Date change by ${offset}:`, {
        from: getLocalDateString(prev),
        to: getLocalDateString(newDate),
        newDate: newDate,
      });

      return newDate;
    });
  };

  // 🔧 ISPRAVLJENA: Prikaz datuma s lokalnim vremenom
  const getDateDisplayText = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const selectedDate = new Date(date);
    selectedDate.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    // Usporedi datume koristeći getTime()
    const selectedTime = selectedDate.getTime();
    const todayTime = today.getTime();
    const yesterdayTime = yesterday.getTime();
    const tomorrowTime = tomorrow.getTime();

    if (selectedTime === todayTime) return "Today";
    if (selectedTime === yesterdayTime) return "Yesterday";
    if (selectedTime === tomorrowTime) return "Tomorrow";

    // Koristi lokalno formatiranje
    return format(date, "dd.MM.");
  };

  // 🔧 ISPRAVLJENA: Funkcija za postavljanje datuma iz kalendara
  const handleDateSelect = (selected) => {
    if (selected) {
      // Stvori novi Date objekt s lokalnim vremenom
      const localDate = new Date(selected);
      localDate.setHours(0, 0, 0, 0);

      console.log("📅 Calendar selected date:", {
        selected: selected,
        localDate: localDate,
        dateString: getLocalDateString(localDate),
      });

      setDate(localDate);
      setOpen(false);
    }
  };

  // 🔧 ISPRAVLJENA: Today button s lokalnim vremenom
  const handleTodayClick = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    console.log("📅 Setting today date:", {
      today: today,
      dateString: getLocalDateString(today),
    });

    setDate(today);
    setOpen(false);
  };

  return (
    <div className="relative flex items-center justify-center gap-1 mt-6 mb-4">
      {/* Prethodnji dan */}
      <button
        onClick={() => handleChange(-1)}
        className="group flex items-center justify-center w-12 h-12 rounded-xl bg-border hover:bg-primary/50 hover:scale-105 transition-all"
        aria-label="Previous day"
      >
        <ChevronLeft className="w-6 h-6 text-primary group-hover:text-white transition-colors" />
      </button>

      {/* Glavni datum button */}
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

      {/* Sljedeći dan */}
      <button
        onClick={() => handleChange(1)}
        className="group flex items-center justify-center w-12 h-12 rounded-xl bg-border hover:bg-primary/50 hover:scale-105 transition-all"
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
