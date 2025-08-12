// src/features/finished_matches/EmptyFinishedMatches.jsx
import CalendarPopover from "../tabs/CalendarPopover";

export default function EmptyFinishedMatches({
  selectedDate,
  setSelectedDate,
  timeFilter,
  priorityFilter,
  resultFilter,
  onRefresh,
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
    return "No finished matches found";
  };

  const getSuggestion = () => {
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

  return (
    <div className="min-h-screen bg-muted rounded-3xl p-1">
      <div className="flex justify-center my-4">
        <div className="bg-green-600 text-white px-4 py-2 rounded-full text-sm font-medium">
          ✅ Finished Matches
        </div>
      </div>

      {/* Date picker */}
      <CalendarPopover date={selectedDate} setDate={setSelectedDate} />

      <div className="text-center mt-12">
        <div className="text-6xl mb-4">✅</div>
        <p className="text-foreground font-black text-2xl mb-2">
          {getEmptyMessage()}
        </p>
        <p className="text-muted-foreground mb-4">{getSuggestion()}</p>

        <button
          onClick={onRefresh}
          className="mt-6 bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition-colors"
        >
          🔄 Refresh
        </button>
      </div>
    </div>
  );
}
