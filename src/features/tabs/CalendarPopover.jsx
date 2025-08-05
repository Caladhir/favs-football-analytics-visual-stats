// src/components/CalendarPopover.jsx
import { useState } from "react";
import { DayPicker } from "react-day-picker";
import { format, addDays } from "date-fns";

export default function CalendarPopover({ date, setDate }) {
  const [open, setOpen] = useState(false);

  const handleChange = (offset) => {
    setDate((prev) => addDays(prev, offset));
  };

  return (
    <div className="relative flex items-center justify-center gap-2 mt-6 mb-4">
      <button
        onClick={() => handleChange(-1)}
        className="text-red-600 hover:text-red-400 px-2 py-1 text-6xl text-center text-outline mb-2 "
      >
        ←
      </button>

      <button
        onClick={() => setOpen(!open)}
        className="border text-white bg-muted px-4 py-1 rounded hover:bg-muted/80 flex items-center gap-2"
      >
        📅 {format(date, "dd.MM.")}
      </button>

      <button
        onClick={() => handleChange(1)}
        className="text-secondary hover:text-primary px-2 py-1 text-6xl text-center text-outline mb-2"
      >
        →
      </button>

      {/* KALENDAR */}
      {open && (
        <div className="absolute mt-2 top-10 right-0 w-82 rounded-lg bg-background text-white shadow-lg border p-4 z-50">
          <div className="flex justify-between items-center mb-2">
            <button
              onClick={() => setOpen(false)}
              className="absolute top-2 right-3 text-gray-400 hover:text-white"
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
            className="block w-1/2 mx-auto text-center mt-3 bg-primary hover:bg-accent text-white font-semibold py-1 rounded"
          >
            TODAY
          </button>
        </div>
      )}
    </div>
  );
}
