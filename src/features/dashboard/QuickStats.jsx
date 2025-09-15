// src/features/dashboard/QuickStats.jsx - Enhanced with Original Styling
import { useQuickStats } from "../../hooks/useQuickStats";

function StatCard({ title, value, sub, delay = 0 }) {
  return (
    <div
      className={`
        group relative p-6 rounded-2xl border border-white/10 
        bg-gradient-to-br from-white/5 to-white/10 backdrop-blur-sm
        hover:scale-105 hover:shadow-2xl hover:shadow-red-500/20 
        transition-all duration-500 ease-out
        hover:border-red-500/30 hover:bg-gradient-to-br hover:from-red-500/10 hover:to-white/10
      `}
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Hover glow effect */}
      <div className="absolute -inset-0.5 bg-gradient-to-r from-red-500/20 to-white/10 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-sm" />

      <div className="relative">
        <div className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-3">
          {title}
        </div>
        <div className="text-4xl md:text-5xl font-black text-white mb-2 group-hover:text-red-400 transition-colors duration-300">
          {value}
        </div>
        {sub && (
          <div className="text-sm text-gray-400 group-hover:text-gray-300 transition-colors duration-300">
            {sub}
          </div>
        )}
      </div>

      {/* Corner accent */}
      <div className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full opacity-50 group-hover:opacity-100 transition-opacity duration-300" />
    </div>
  );
}

export default function QuickStats() {
  const { stats, loading, error, meta } = useQuickStats();

  if (loading) {
    return (
      <div className="p-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-32 rounded-2xl bg-gradient-to-br from-gray-800/50 to-gray-700/50 animate-pulse border border-white/10"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="text-center p-6 bg-red-900/20 border border-red-500/30 rounded-2xl backdrop-blur-sm">
          <div className="text-red-400 text-lg font-semibold mb-2">
            ⚠️ Error Loading Stats
          </div>
          <div className="text-red-300 text-sm">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold bg-gradient-to-r from-white via-red-200 to-white bg-clip-text text-transparent mb-2">
          Key Statistics
        </h2>
        <p className="text-gray-400 text-sm">
          Snapshot of recent performance & activity
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <StatCard
          title="Matches Today"
          value={stats.matchesToday ?? 0}
          delay={80}
        />
        <StatCard
          title="Avg Goals (7d)"
          value={(stats.avgGoals7d ?? 0).toFixed(2)}
          delay={160}
        />
        <StatCard
          title="Players Total"
          value={stats.totalPlayers ?? stats.activePlayers7d ?? 0}
          delay={240}
        />
      </div>

      {/* Footer indicator */}
      <div className="text-center mt-8">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span className="text-xs text-gray-400">Live data • Auto‑refresh</span>
        </div>
      </div>
    </div>
  );
}
