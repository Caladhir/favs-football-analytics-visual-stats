// src/features/upcoming_matches/EmptyUpcomingMatches.jsx
import CalendarPopover from "../tabs/CalendarPopover";

export default function EmptyUpcomingMatches({
  selectedDate,
  setSelectedDate,
  timeFilter,
  priorityFilter,
  onRefresh,
}) {
  const getEmptyMessage = () => {
    if (timeFilter === "today") {
      return "No matches scheduled for today";
    }
    if (timeFilter === "tomorrow") {
      return "No matches scheduled for tomorrow";
    }
    if (timeFilter === "next24h") {
      return "No matches starting in the next 24 hours";
    }
    if (timeFilter === "week") {
      return "No matches scheduled this week";
    }
    if (priorityFilter === "top") {
      return "No upcoming matches in top leagues";
    }
    if (priorityFilter === "regional") {
      return "No upcoming matches in regional leagues";
    }
    return "No upcoming matches found";
  };

  const getSuggestion = () => {
    if (timeFilter !== "all") {
      return "Try changing the time filter or selecting a different date";
    }
    if (priorityFilter !== "all") {
      return "Try changing the league filter to see more matches";
    }
    return "Try selecting a different date or check back later";
  };

  return (
    <div className="min-h-screen bg-muted rounded-3xl p-1">
      <div className="flex justify-center my-4">
        <div className="bg-blue-600 text-white px-4 py-2 rounded-full text-sm font-medium">
          ⏰ Upcoming Matches
        </div>
      </div>

      {/* Date picker */}
      <CalendarPopover date={selectedDate} setDate={setSelectedDate} />

      <div className="text-center mt-12">
        <div className="text-6xl mb-4">⏰</div>
        <p className="text-foreground font-black text-2xl mb-2">
          {getEmptyMessage()}
        </p>
        <p className="text-muted-foreground mb-4">{getSuggestion()}</p>

        <button
          onClick={onRefresh}
          className="mt-6 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          🔄 Refresh
        </button>
      </div>
    </div>
  );
}
