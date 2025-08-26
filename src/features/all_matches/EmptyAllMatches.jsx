// src/features/all_matches/EmptyAllMatches.jsx - REDESIGNED WITH MODERN STYLING
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
    if (isToday()) return "No matches today";
    if (isYesterday()) return "No matches yesterday";
    if (isTomorrow()) return "No matches tomorrow";
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
        color: "from-blue-500 to-blue-600",
      },
      {
        label: "Yesterday",
        date: yesterday,
        disabled: isYesterday(),
        icon: "🌅",
        color: "from-orange-500 to-orange-600",
      },
      {
        label: "Tomorrow",
        date: tomorrow,
        disabled: isTomorrow(),
        icon: "🌄",
        color: "from-purple-500 to-purple-600",
      },
    ];
  };

  return (
    <div className="relative min-h-screen">
      {/* Status Badge */}
      <div className="flex justify-center pt-6">
        <div className="bg-gradient-to-r from-gray-700 to-gray-800 text-white px-6 py-3 rounded-full text-sm font-bold shadow-lg backdrop-blur-sm border border-gray-600/30">
          📅 All Matches
        </div>
      </div>

      {/* Date picker */}
      <CalendarPopover date={selectedDate} setDate={setSelectedDate} />

      {/* Empty State Content */}
      <div className="text-center mt-16 px-6">
        {/* Icon */}
        <div className="mb-8">
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-br from-red-500/20 to-red-600/30 backdrop-blur-sm border border-red-500/30 mb-6">
            <span className="text-6xl">📅</span>
          </div>
        </div>

        {/* Main message */}
        <h2 className="text-4xl font-black text-white mb-4 bg-gradient-to-r from-red-400 via-white to-red-400 bg-clip-text text-transparent">
          {getEmptyMessage()}
        </h2>

        <p className="text-lg text-gray-300 mb-8 max-w-2xl mx-auto leading-relaxed">
          {getSuggestion()}
        </p>

        {/* Quick date actions */}
        <div className="flex flex-wrap justify-center gap-4 mb-8">
          {getQuickActions().map((action) => (
            <button
              key={action.label}
              onClick={() => setSelectedDate(action.date)}
              disabled={action.disabled}
              className={`group relative overflow-hidden px-6 py-4 rounded-xl font-semibold transition-all duration-300 flex items-center gap-3 min-w-[140px] justify-center shadow-lg hover:shadow-2xl ${
                action.disabled
                  ? "bg-gradient-to-r from-gray-700/50 to-gray-800/50 text-gray-400 cursor-not-allowed border border-gray-600/30"
                  : `bg-gradient-to-r ${action.color} text-white hover:scale-105 border border-white/20 hover:border-white/40`
              }`}
            >
              {!action.disabled && (
                <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              )}
              <span className="text-xl">{action.icon}</span>
              <span className="relative z-10">{action.label}</span>
            </button>
          ))}
        </div>

        {/* Refresh button */}
        <button
          onClick={onRefresh}
          className="group relative overflow-hidden bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-bold px-8 py-4 rounded-xl transition-all duration-300 hover:scale-105 shadow-lg hover:shadow-2xl hover:shadow-red-500/40"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <span className="relative z-10 flex items-center gap-2">
            <span>🔄</span>
            Refresh Data
          </span>
        </button>

        {/* Additional info */}
        <div className="mt-12 p-6 bg-gradient-to-r from-gray-800/40 via-gray-900/60 to-gray-800/40 backdrop-blur-sm rounded-2xl border border-gray-700/30 max-w-2xl mx-auto">
          <h3 className="text-lg font-bold text-white mb-3">💡 Tip</h3>
          <p className="text-gray-300 text-sm leading-relaxed">
            Try selecting different dates or check back later. Match schedules
            are updated regularly, and new fixtures may become available.
          </p>
        </div>
      </div>
    </div>
  );
}
