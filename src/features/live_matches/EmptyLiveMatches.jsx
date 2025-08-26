// src/features/live_matches/EmptyLiveMatches.jsx - REDESIGNED WITH MODERN STYLING
import { RefreshButton } from "../../ui/SpecializedButtons";

export default function EmptyLiveMatches({ onRefresh }) {
  const getTimeBasedMessage = () => {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 12) {
      return {
        primary: "Good morning! No live matches yet.",
        secondary:
          "Football matches typically start later in the day. Check back this afternoon or evening.",
        icon: "🌅",
      };
    } else if (hour >= 12 && hour < 18) {
      return {
        primary: "No live matches right now",
        secondary:
          "Most European matches start in the evening. Try checking back around 6-9 PM local time.",
        icon: "🌤️",
      };
    } else if (hour >= 18 && hour < 23) {
      return {
        primary: "No live matches at the moment",
        secondary:
          "This is usually prime time for football. Check back in a few minutes or refresh to see if new matches have started.",
        icon: "🌆",
      };
    } else {
      return {
        primary: "No live matches overnight",
        secondary:
          "Football matches are rarely played during nighttime hours. Check back tomorrow morning.",
        icon: "🌙",
      };
    }
  };

  const timeMessage = getTimeBasedMessage();

  return (
    <div className="relative min-h-[600px]">
      {/* Status Badge */}
      <div className="flex justify-center pt-6">
        <div className="bg-gradient-to-r from-red-600/80 to-red-700/80 backdrop-blur-sm text-white px-6 py-3 rounded-full text-sm font-bold shadow-lg border border-red-500/30 flex items-center gap-3">
          <div className="w-3 h-3 bg-white/70 rounded-full"></div>
          🔴 Live Matches
          <div className="w-3 h-3 bg-white/40 rounded-full"></div>
        </div>
      </div>

      {/* Empty State Content */}
      <div className="text-center mt-16 px-6">
        {/* Icon with animation */}
        <div className="mb-8">
          <div className="inline-flex items-center justify-center w-32 h-32 rounded-full bg-gradient-to-br from-red-500/20 to-red-600/30 backdrop-blur-sm border border-red-500/30 mb-6 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-red-500/10 to-transparent animate-pulse"></div>
            <div className="text-6xl relative z-10 animate-bounce">
              {timeMessage.icon}
            </div>
          </div>
        </div>

        {/* Main message */}
        <h2 className="text-4xl font-black text-white mb-4 bg-gradient-to-r from-red-400 via-white to-red-400 bg-clip-text text-transparent">
          {timeMessage.primary}
        </h2>

        <p className="text-lg text-gray-300 mb-8 max-w-2xl mx-auto leading-relaxed">
          {timeMessage.secondary}
        </p>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
          <RefreshButton
            onClick={onRefresh}
            size="lg"
            className="group relative overflow-hidden bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-bold px-8 py-4 rounded-xl shadow-lg hover:shadow-2xl hover:shadow-red-500/40 transition-all duration-300 hover:scale-105"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <span className="relative z-10 flex items-center gap-2">
              🔄 Refresh Live Data
            </span>
          </RefreshButton>

          <button className="group relative overflow-hidden bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-bold px-8 py-4 rounded-xl shadow-lg hover:shadow-2xl hover:shadow-blue-500/40 transition-all duration-300 hover:scale-105">
            <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <span className="relative z-10 flex items-center gap-2">
              📅 View All Matches
            </span>
          </button>
        </div>

        {/* Info cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          <div className="group bg-gradient-to-br from-gray-800/60 to-gray-900/80 backdrop-blur-sm rounded-2xl p-6 border border-gray-700/30 hover:border-red-500/40 transition-all duration-300 hover:scale-105">
            <div className="text-3xl mb-4 group-hover:animate-bounce">⚡</div>
            <h3 className="text-lg font-bold text-white mb-2 group-hover:text-red-400 transition-colors">
              Auto-Refresh
            </h3>
            <p className="text-gray-400 text-sm group-hover:text-gray-300 transition-colors">
              We automatically check for new live matches every 30 seconds
            </p>
          </div>

          <div className="group bg-gradient-to-br from-gray-800/60 to-gray-900/80 backdrop-blur-sm rounded-2xl p-6 border border-gray-700/30 hover:border-blue-500/40 transition-all duration-300 hover:scale-105">
            <div className="text-3xl mb-4 group-hover:animate-bounce">🌍</div>
            <h3 className="text-lg font-bold text-white mb-2 group-hover:text-blue-400 transition-colors">
              Global Coverage
            </h3>
            <p className="text-gray-400 text-sm group-hover:text-gray-300 transition-colors">
              We track matches from top leagues around the world
            </p>
          </div>

          <div className="group bg-gradient-to-br from-gray-800/60 to-gray-900/80 backdrop-blur-sm rounded-2xl p-6 border border-gray-700/30 hover:border-green-500/40 transition-all duration-300 hover:scale-105">
            <div className="text-3xl mb-4 group-hover:animate-bounce">📊</div>
            <h3 className="text-lg font-bold text-white mb-2 group-hover:text-green-400 transition-colors">
              Live Stats
            </h3>
            <p className="text-gray-400 text-sm group-hover:text-gray-300 transition-colors">
              Real-time scores, events, and match statistics when games are live
            </p>
          </div>
        </div>

        {/* Tips section */}
        <div className="mt-12 p-6 bg-gradient-to-r from-gray-800/40 via-gray-900/60 to-gray-800/40 backdrop-blur-sm rounded-2xl border border-gray-700/30 max-w-2xl mx-auto">
          <h3 className="text-lg font-bold text-white mb-3">
            💡 When to check for live matches
          </h3>
          <div className="text-gray-300 text-sm space-y-2">
            <p>
              <strong>Weekends:</strong> Most matches are Saturday and Sunday
              afternoons
            </p>
            <p>
              <strong>Weekdays:</strong> Champions League (Tue/Wed), Europa
              League (Thu)
            </p>
            <p>
              <strong>Prime time:</strong> 6:00 PM - 10:00 PM European time
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
