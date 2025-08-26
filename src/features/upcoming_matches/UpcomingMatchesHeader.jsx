// src/features/upcoming_matches/UpcomingMatchesHeader.jsx - REDESIGNED WITH MODERN STYLING
import CalendarPopover from "../tabs/CalendarPopover";

export default function UpcomingMatchesHeader({
  selectedDate,
  setSelectedDate,
  count = 0,
  backgroundRefreshing = false,
}) {
  const getDateDisplayText = () => {
    if (!selectedDate) return "";

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selected = new Date(selectedDate);
    selected.setHours(0, 0, 0, 0);

    const diffTime = selected.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Tomorrow";
    if (diffDays === -1) return "Yesterday";

    return selected.toLocaleDateString(undefined, {
      weekday: "long",
      day: "2-digit",
      month: "short",
    });
  };

  return (
    <div className="relative">
      {/* Calendar Popover */}
      <CalendarPopover
        date={selectedDate}
        setDate={setSelectedDate}
        maxDateToday={false}
      />

      {/* Match Info */}
      {count > 0 && (
        <div className="flex justify-center mt-4 mb-6">
          <div className="bg-gradient-to-r from-gray-700/80 to-gray-800/80 backdrop-blur-sm text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-lg border border-gray-600/30 flex items-center gap-2">
            <span>📅</span>
            {count} match{count !== 1 ? "es" : ""} scheduled for{" "}
            {getDateDisplayText()}
          </div>
        </div>
      )}

      {/* Background refresh indicator */}
      {backgroundRefreshing && (
        <div className="absolute top-2 right-2">
          <div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
        </div>
      )}
    </div>
  );
}
