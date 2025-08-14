// src/features/finished_matches/EmptyFinishedMatches.jsx - WITH DATE RESTRICTIONS
import React, { useMemo } from "react";
import CalendarPopover from "../tabs/CalendarPopover"; // Adjust import if needed

// 🔒 Restricted calendar for Finished matches
function RestrictedCalendarPopover({ date, setDate, maxDateToday = true }) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const formatDate = (d) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const handleDateChange = (newDate) => {
    const selected = new Date(newDate);
    selected.setHours(0, 0, 0, 0);

    // Ne dopusti buduće datume
    if (maxDateToday && selected > today) {
      return;
    }

    setDate(selected);
  };

  return (
    <div className="flex justify-center my-4">
      <input
        type="date"
        value={formatDate(date)}
        onChange={(e) =>
          handleDateChange(new Date(e.target.value + "T00:00:00"))
        }
        max={maxDateToday ? formatDate(today) : undefined}
        className="px-3 py-2 rounded-lg border bg-background text-foreground"
      />
    </div>
  );
}

export default function EmptyFinishedMatches({
  selectedDate,
  setSelectedDate,
  timeFilter,
  priorityFilter,
  resultFilter,
  onRefresh,
  maxDateToday = true, // 🔒 Default to blocking future dates
}) {
  const getEmptyMessage = () => {
    if (timeFilter === "today") {
      return "No matches finished today";
    }
    if (timeFilter === "yesterday") {
      return "No matches finished yesterday";
    }
    if (timeFilter === "week") {
      return "No matches finished this week";
    }
    if (priorityFilter === "top") {
      return "No finished matches in top leagues";
    }
    if (priorityFilter === "regional") {
      return "No finished matches in regional leagues";
    }
    if (resultFilter === "withGoals") {
      return "No finished matches with goals";
    }
    if (resultFilter === "draws") {
      return "No drawn matches found";
    }

    // Check if selected date is in future
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selected = new Date(selectedDate);
    selected.setHours(0, 0, 0, 0);

    if (selected > today) {
      return "Cannot show finished matches for future dates";
    }

    return "No finished matches found";
  };

  const getSuggestion = () => {
    // Check if selected date is in future
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selected = new Date(selectedDate);
    selected.setHours(0, 0, 0, 0);

    if (selected > today) {
      return "Please select today or a past date to see finished matches";
    }

    if (timeFilter !== "all") {
      return "Try changing the time filter or selecting a different date";
    }
    if (priorityFilter !== "all") {
      return "Try changing the league filter to see more matches";
    }
    if (resultFilter !== "all") {
      return "Try changing the result filter to see more matches";
    }
    return "Try selecting a different date or check back later";
  };

  const goToToday = () => {
    setSelectedDate(new Date());
  };

  return (
    <div className="min-h-screen bg-muted rounded-3xl p-1 ">
      <div className="flex justify-center my-4">
        <div className="bg-green-600 text-white px-4 py-2 rounded-full text-sm font-medium">
          ✅ Finished Matches
        </div>
      </div>

      {/* Date picker with restrictions */}
      <div className="flex justify-center gap-2">
        <CalendarPopover
          date={selectedDate}
          setDate={setSelectedDate}
          maxDateToday={maxDateToday}
        />
      </div>

      <div className="text-center mt-12">
        <div className="text-6xl mb-4">✅</div>
        <p className="text-foreground font-black text-2xl mb-2">
          {getEmptyMessage()}
        </p>
        <p className="text-muted-foreground mb-4">{getSuggestion()}</p>

        <div className="flex justify-center gap-3 mt-6">
          {/* Today button if not on today */}
          {selectedDate.toDateString() !== new Date().toDateString() && (
            <button
              onClick={goToToday}
              className="bg-gray-600 text-white px-6 py-2 rounded-lg hover:bg-gray-700 transition-colors"
            >
              📅 Go to Today
            </button>
          )}

          <button
            onClick={onRefresh}
            className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition-colors"
          >
            🔄 Refresh
          </button>
        </div>
      </div>
    </div>
  );
}
