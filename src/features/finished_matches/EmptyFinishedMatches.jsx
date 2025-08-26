// src/features/finished_matches/EmptyFinishedMatches.jsx - REDESIGNED WITH MODERN STYLING
import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import CalendarPopover from "../tabs/CalendarPopover";

export default function EmptyFinishedMatches({
  selectedDate,
  setSelectedDate,
  timeFilter,
  priorityFilter,
  resultFilter,
  onRefresh,
  maxDateToday = true,
}) {
  const navigate = useNavigate();

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
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selected = new Date(selectedDate);
    selected.setHours(0, 0, 0, 0);

    if (selected > today) {
      return "Please select today or a past date to see finished matches";
    }

    if (timeFilter !== "all") {
      return "Try changing the time filter or selecting a different date to find completed matches.";
    }
    if (priorityFilter !== "all") {
      return "Try changing the league filter to see matches from all competitions.";
    }
    if (resultFilter !== "all") {
      return "Try changing the result filter to see all match outcomes.";
    }
    return "Try selecting a different date or check back later for updated results.";
  };

  const goToToday = () => {
    setSelectedDate(new Date());
  };

  const getQuickActions = () => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const lastWeekend = new Date(today);
    lastWeekend.setDate(
      today.getDate() - (today.getDay() === 0 ? 0 : today.getDay())
    );

    return [
      {
        label: "Today",
        date: today,
        icon: "📅",
        color: "from-blue-500 to-blue-600",
        disabled: selectedDate.toDateString() === today.toDateString(),
      },
      {
        label: "Yesterday",
        date: yesterday,
        icon: "🌅",
        color: "from-orange-500 to-orange-600",
        disabled: selectedDate.toDateString() === yesterday.toDateString(),
      },
      {
        label: "Last Weekend",
        date: lastWeekend,
        icon: "⚽",
        color: "from-green-500 to-green-600",
        disabled: selectedDate.toDateString() === lastWeekend.toDateString(),
      },
    ];
  };

  const quickActions = getQuickActions();

  return (
    <div className="relative min-h-[600px]">
      {/* Date picker */}
      <CalendarPopover
        date={selectedDate}
        setDate={setSelectedDate}
        maxDateToday={maxDateToday}
      />

      {/* Empty State Content */}
      <div className="text-center mt-16 px-6">
        {/* Icon */}
        <div className="mb-8">
          <div className="inline-flex items-center justify-center w-32 h-32 rounded-full bg-gradient-to-br from-green-500/20 to-green-600/30 backdrop-blur-sm border border-green-500/30 mb-6 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-green-500/10 to-transparent animate-pulse"></div>
            <div className="text-6xl relative z-10">✅</div>
          </div>
        </div>

        {/* Main message */}
        <h2 className="text-4xl font-black text-white mb-4 bg-gradient-to-r from-green-400 via-white to-green-400 bg-clip-text text-transparent">
          {getEmptyMessage()}
        </h2>

        <p className="text-lg text-gray-300 mb-8 max-w-2xl mx-auto leading-relaxed">
          {getSuggestion()}
        </p>

        {/* Quick date actions */}
        <div className="flex flex-wrap justify-center gap-4 mb-12">
          {quickActions.map((action, index) => (
            <button
              key={index}
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

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
          <button
            onClick={onRefresh}
            className="group relative overflow-hidden bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 text-white font-bold px-8 py-4 rounded-xl transition-all duration-300 hover:scale-105 shadow-lg hover:shadow-2xl hover:shadow-green-500/40"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <span className="relative z-10 flex items-center gap-2">
              🔄 Refresh Data
            </span>
          </button>

          <button
            onClick={() => navigate("/matches")}
            className="group relative overflow-hidden bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-500 hover:to-gray-600 text-white font-bold px-8 py-4 rounded-xl transition-all duration-300 hover:scale-105 shadow-lg hover:shadow-2xl hover:shadow-gray-500/40"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <span className="relative z-10 flex items-center gap-2">
              📅 View All Matches
            </span>
          </button>
        </div>

        {/* Info cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          <div className="group bg-gradient-to-br from-gray-800/60 to-gray-900/80 backdrop-blur-sm rounded-2xl p-6 border border-gray-700/30 hover:border-green-500/40 transition-all duration-300 hover:scale-105">
            <div className="text-3xl mb-4 group-hover:animate-bounce">📊</div>
            <h3 className="text-lg font-bold text-white mb-2 group-hover:text-green-400 transition-colors">
              Match Results
            </h3>
            <p className="text-gray-400 text-sm group-hover:text-gray-300 transition-colors">
              Completed matches with final scores, goals, and match statistics
            </p>
          </div>

          <div className="group bg-gradient-to-br from-gray-800/60 to-gray-900/80 backdrop-blur-sm rounded-2xl p-6 border border-gray-700/30 hover:border-blue-500/40 transition-all duration-300 hover:scale-105">
            <div className="text-3xl mb-4 group-hover:animate-bounce">📈</div>
            <h3 className="text-lg font-bold text-white mb-2 group-hover:text-blue-400 transition-colors">
              Historical Data
            </h3>
            <p className="text-gray-400 text-sm group-hover:text-gray-300 transition-colors">
              Browse through past matches to analyze trends and team performance
            </p>
          </div>

          <div className="group bg-gradient-to-br from-gray-800/60 to-gray-900/80 backdrop-blur-sm rounded-2xl p-6 border border-gray-700/30 hover:border-purple-500/40 transition-all duration-300 hover:scale-105">
            <div className="text-3xl mb-4 group-hover:animate-bounce">🔍</div>
            <h3 className="text-lg font-bold text-white mb-2 group-hover:text-purple-400 transition-colors">
              Advanced Filters
            </h3>
            <p className="text-gray-400 text-sm group-hover:text-gray-300 transition-colors">
              Filter by league, result type, goals scored, and more criteria
            </p>
          </div>
        </div>

        {/* Tips section */}
        <div className="mt-12 p-6 bg-gradient-to-r from-gray-800/40 via-gray-900/60 to-gray-800/40 backdrop-blur-sm rounded-2xl border border-gray-700/30 max-w-2xl mx-auto">
          <h3 className="text-lg font-bold text-white mb-3">
            💡 Finding Match Results
          </h3>
          <div className="text-gray-300 text-sm space-y-2">
            <p>
              <strong>Recent:</strong> Most matches finish within 2 hours of
              kickoff
            </p>
            <p>
              <strong>Weekends:</strong> Saturday and Sunday have the most
              completed matches
            </p>
            <p>
              <strong>Competitions:</strong> Use league filters to focus on
              specific tournaments
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
