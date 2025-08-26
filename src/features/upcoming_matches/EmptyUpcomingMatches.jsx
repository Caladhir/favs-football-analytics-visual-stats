// src/features/upcoming_matches/EmptyUpcomingMatches.jsx - REDESIGNED WITH MODERN STYLING
import CalendarPopover from "../tabs/CalendarPopover";
import useMatchesByDate from "../../hooks/useMatchesByDate";
import { useNavigate } from "react-router-dom";

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
  const navigate = useNavigate();

  const { matches, loading, backgroundRefreshing, error, refetch } =
    useMatchesByDate(selectedDate, { enabled: true });

  const getSuggestion = () => {
    if (timeFilter !== "all") {
      return "Try changing the time filter or selecting a different date to find scheduled matches.";
    }
    if (priorityFilter !== "all") {
      return "Try changing the league filter to see matches from all leagues.";
    }
    return "Try selecting a different date or check back later for newly scheduled matches.";
  };

  const getTimeBasedAdvice = () => {
    const hour = new Date().getHours();
    const day = new Date().getDay(); // 0 = Sunday, 6 = Saturday

    if (day === 0) {
      // Sunday
      return {
        title: "Weekend Football",
        message:
          "Most European matches are played on weekends. Try checking Saturday or upcoming weekdays for Champions League matches.",
      };
    } else if (day === 6) {
      // Saturday
      return {
        title: "Weekend Schedule",
        message:
          "Saturday typically has the most matches. Sunday also has good coverage from major leagues.",
      };
    } else if (day >= 1 && day <= 4) {
      // Mon-Thu
      return {
        title: "Midweek Matches",
        message:
          "Tuesday and Wednesday usually have Champions League. Thursday has Europa League matches.",
      };
    } else {
      // Friday
      return {
        title: "Weekend Preview",
        message:
          "Weekend matches are just around the corner! Most games are scheduled for Saturday and Sunday.",
      };
    }
  };

  const quickDateActions = () => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const nextSaturday = new Date(today);
    nextSaturday.setDate(today.getDate() + (6 - today.getDay()));
    const nextSunday = new Date(today);
    nextSunday.setDate(today.getDate() + (7 - today.getDay()));

    return [
      {
        label: "Tomorrow",
        date: tomorrow,
        icon: "🌅",
        color: "from-orange-500 to-orange-600",
      },
      {
        label: "Next Saturday",
        date: nextSaturday,
        icon: "⚽",
        color: "from-green-500 to-green-600",
      },
      {
        label: "Next Sunday",
        date: nextSunday,
        icon: "🏆",
        color: "from-purple-500 to-purple-600",
      },
    ];
  };

  const timeAdvice = getTimeBasedAdvice();

  return (
    <div className="relative min-h-[600px]">
      {/* Status Badge */}
      <div className="flex justify-center pt-6">
        <div className="bg-gradient-to-r from-blue-600/80 to-blue-700/80 backdrop-blur-sm text-white px-6 py-3 rounded-full text-sm font-bold shadow-lg border border-blue-500/30">
          ⏰ Upcoming Matches
        </div>
      </div>

      {/* Date picker */}
      <CalendarPopover date={selectedDate} setDate={setSelectedDate} />

      {/* Empty State Content */}
      <div className="text-center mt-16 px-6">
        {/* Icon */}
        <div className="mb-8">
          <div className="inline-flex items-center justify-center w-32 h-32 rounded-full bg-gradient-to-br from-blue-500/20 to-blue-600/30 backdrop-blur-sm border border-blue-500/30 mb-6 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-transparent animate-pulse"></div>
            <div className="text-6xl relative z-10">⏰</div>
          </div>
        </div>

        {/* Main message */}
        <h2 className="text-4xl font-black text-white mb-4 bg-gradient-to-r from-blue-400 via-white to-blue-400 bg-clip-text text-transparent">
          {getEmptyMessage()}
        </h2>

        <p className="text-lg text-gray-300 mb-8 max-w-2xl mx-auto leading-relaxed">
          {getSuggestion()}
        </p>

        {/* Quick date actions */}
        <div className="flex flex-wrap justify-center gap-4 mb-12">
          {quickDateActions().map((action, index) => (
            <button
              key={index}
              onClick={() => setSelectedDate(action.date)}
              className={`group relative overflow-hidden px-6 py-4 rounded-xl font-semibold transition-all duration-300 flex items-center gap-3 min-w-[140px] justify-center shadow-lg hover:shadow-2xl bg-gradient-to-r ${action.color} text-white hover:scale-105 border border-white/20 hover:border-white/40`}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <span className="text-xl">{action.icon}</span>
              <span className="relative z-10">{action.label}</span>
            </button>
          ))}
        </div>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
          <button
            onClick={refetch}
            disabled={backgroundRefreshing}
            className={`px-6 py-3 rounded-xl font-medium transition-all duration-200 flex items-center gap-2 ${
              backgroundRefreshing
                ? "bg-gray-600 text-gray-300 cursor-not-allowed"
                : "bg-blue-600 text-white hover:bg-blue-700 hover:scale-105 active:scale-95"
            }`}
          >
            <span className={`${backgroundRefreshing ? "animate-spin" : ""}`}>
              🔄
            </span>
            {backgroundRefreshing ? "Refreshing..." : "Refresh"}
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

        {/* Time-based advice card */}
        <div className="max-w-2xl mx-auto mb-8">
          <div className="bg-gradient-to-br from-gray-800/60 to-gray-900/80 backdrop-blur-sm rounded-2xl p-6 border border-blue-500/20 hover:border-blue-500/40 transition-all duration-300">
            <h3 className="text-lg font-bold text-blue-400 mb-3">
              {timeAdvice.title}
            </h3>
            <p className="text-gray-300 text-sm leading-relaxed">
              {timeAdvice.message}
            </p>
          </div>
        </div>

        {/* Info cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          <div className="group bg-gradient-to-br from-gray-800/60 to-gray-900/80 backdrop-blur-sm rounded-2xl p-6 border border-gray-700/30 hover:border-blue-500/40 transition-all duration-300 hover:scale-105">
            <div className="text-3xl mb-4 group-hover:animate-bounce">📊</div>
            <h3 className="text-lg font-bold text-white mb-2 group-hover:text-blue-400 transition-colors">
              Match Schedules
            </h3>
            <p className="text-gray-400 text-sm group-hover:text-gray-300 transition-colors">
              Fixtures are usually announced 1-2 weeks in advance by leagues and
              competitions
            </p>
          </div>

          <div className="group bg-gradient-to-br from-gray-800/60 to-gray-900/80 backdrop-blur-sm rounded-2xl p-6 border border-gray-700/30 hover:border-green-500/40 transition-all duration-300 hover:scale-105">
            <div className="text-3xl mb-4 group-hover:animate-bounce">🏆</div>
            <h3 className="text-lg font-bold text-white mb-2 group-hover:text-green-400 transition-colors">
              Peak Times
            </h3>
            <p className="text-gray-400 text-sm group-hover:text-gray-300 transition-colors">
              Most matches are Saturday/Sunday afternoons and Tuesday/Wednesday
              evenings
            </p>
          </div>

          <div className="group bg-gradient-to-br from-gray-800/60 to-gray-900/80 backdrop-blur-sm rounded-2xl p-6 border border-gray-700/30 hover:border-purple-500/40 transition-all duration-300 hover:scale-105">
            <div className="text-3xl mb-4 group-hover:animate-bounce">🔄</div>
            <h3 className="text-lg font-bold text-white mb-2 group-hover:text-purple-400 transition-colors">
              Auto Updates
            </h3>
            <p className="text-gray-400 text-sm group-hover:text-gray-300 transition-colors">
              We automatically check for new fixture announcements every 2 hours
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
