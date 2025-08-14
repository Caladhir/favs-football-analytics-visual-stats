import CalendarPopover from "../tabs/CalendarPopover";

export default function UpcomingMatchesHeader({
  selectedDate,
  setSelectedDate,
  count = 0,
  backgroundRefreshing = false,
}) {
  const dateText = selectedDate
    ? selectedDate.toLocaleDateString(undefined, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "";

  return (
    <div className="text-center space-y-3 my-4">
      <div className="flex justify-center">
        <div className="bg-blue-600 text-white px-4 py-2 rounded-full text-sm font-medium flex items-center">
          <div
            className={`w-2 h-2 bg-white rounded-full mr-2 ${
              backgroundRefreshing ? "animate-spin" : "animate-pulse"
            }`}
          />
          ⏰ Upcoming Matches
          {backgroundRefreshing && (
            <span className="ml-2 text-xs opacity-75">...</span>
          )}
        </div>
      </div>

      <CalendarPopover date={selectedDate} setDate={setSelectedDate} />

      <div className="text-muted-foreground text-sm">
        Showing matches for{" "}
        <span className="font-medium text-foreground">{dateText}</span>
      </div>

      <div className="text-xs text-muted-foreground">{count} matches found</div>
    </div>
  );
}
