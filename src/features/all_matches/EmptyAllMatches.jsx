// src/features/all_matches/EmptyAllMatches.jsx - CONSISTENT WITH OTHER EMPTY STATES
import CalendarPopover from "../tabs/CalendarPopover";

export default function EmptyAllMatches({
  selectedDate,
  setSelectedDate,
  onRefresh,
}) {
  const isToday = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selected = new Date(selectedDate);
    selected.setHours(0, 0, 0, 0);
    return today.getTime() === selected.getTime();
  };

  const isYesterday = () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const selected = new Date(selectedDate);
    selected.setHours(0, 0, 0, 0);
    return yesterday.getTime() === selected.getTime();
  };

  const isTomorrow = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const selected = new Date(selectedDate);
    selected.setHours(0, 0, 0, 0);
    return tomorrow.getTime() === selected.getTime();
  };

  const getEmptyMessage = () => {
    if (isToday()) {
      return "No matches today";
    }
    if (isYesterday()) {
      return "No matches yesterday";
    }
    if (isTomorrow()) {
      return "No matches tomorrow";
    }
    return "No matches found";
  };

  const getSuggestion = () => {
    if (isToday()) {
      return "There are no football matches scheduled for today. Try checking tomorrow or another date.";
    }
    if (isYesterday()) {
      return "No matches were played yesterday. Try checking today or another date.";
    }
    if (isTomorrow()) {
      return "No matches are scheduled for tomorrow yet. Check back later or try another date.";
    }
    return "No matches are available for the selected date. Try choosing a different date.";
  };

  const getQuickActions = () => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    return [
      {
        label: "Today",
        date: today,
        disabled: isToday(),
        icon: "📅",
      },
      {
        label: "Yesterday",
        date: yesterday,
        disabled: isYesterday(),
        icon: "🌅",
      },
      {
        label: "Tomorrow",
        date: tomorrow,
        disabled: isTomorrow(),
        icon: "🌄",
      },
    ];
  };

  return (
    <div className="min-h-screen bg-muted rounded-3xl p-1">
      <div className="flex justify-center my-4">
        <div className="bg-gray-600 text-white px-4 py-2 rounded-full text-sm font-medium">
          📅 All Matches
        </div>
      </div>

      {/* Date picker */}
      <CalendarPopover date={selectedDate} setDate={setSelectedDate} />

      <div className="text-center mt-12">
        <div className="text-6xl mb-4">📅</div>
        <p className="text-foreground font-black text-2xl mb-2">
          {getEmptyMessage()}
        </p>
        <p className="text-muted-foreground mb-6 max-w-md mx-auto">
          {getSuggestion()}
        </p>

        {/* Quick date actions */}
        <div className="flex justify-center gap-3 mb-6">
          {getQuickActions().map((action) => (
            <button
              key={action.label}
              onClick={() => setSelectedDate(action.date)}
              disabled={action.disabled}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                action.disabled
                  ? "bg-gray-600 text-gray-300 cursor-not-allowed"
                  : "bg-primary text-white hover:bg-primary/80"
              }`}
            >
              <span>{action.icon}</span>
              {action.label}
            </button>
          ))}
        </div>

        {/* Refresh button */}
        <button
          onClick={onRefresh}
          className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          🔄 Refresh Data
        </button>
      </div>
    </div>
  );
}
