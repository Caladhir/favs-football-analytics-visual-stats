// src/features/tabs/DateSelector.jsx
import { format, addDays } from "date-fns";

export default function DateSelector({ date, setDate }) {
  const today = new Date();

  const handleChange = (offset) => {
    setDate((prev) => addDays(prev, offset));
  };

  return (
    <div className="flex items-center justify-center gap-4 mt-6 mb-4">
      <button
        onClick={() => handleChange(-1)}
        className="text-sm hover:underline"
      >
        ← Previous
      </button>

      <button onClick={() => setDate(today)} className="font-bold">
        Today
      </button>

      <button
        onClick={() => handleChange(1)}
        className="text-sm hover:underline"
      >
        Next →
      </button>

      <span className="ml-4 text-muted-foreground">
        {format(date, "dd.MM.yyyy.")}
      </span>
    </div>
  );
}
