// src/pages/Match.jsx
import { useParams, Link } from "react-router-dom";
import useMatchData from "../../hooks/useMatchData";
import MatchHeader from "../../features/match/MatchHeader";
import MatchTabs from "../../features/match/MatchTabs";
import OverviewTab from "../../features/match/OverviewTab";
import LineupsTab from "../../features/match/LineupsTab";
import StatsTab from "../../features/match/StatsTab";
import H2HTab from "../../features/match/H2HTab";
import PredictionBox from "../../features/match/PredictionBox";

export default function MatchPage() {
  const { id } = useParams();
  const {
    match,
    events,
    lineups,
    formations,
    playerStats,
    h2h,
    agg,
    loading,
    bgRefreshing,
    error,
    refetch,
    scorers,
    richStats,
  } = useMatchData(id);

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-6">
        <Skeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-6">
        <div className="mx-auto max-w-5xl">
          <div className="mb-4">
            <Link
              to="/matches"
              className="text-sm text-zinc-400 hover:text-zinc-200"
            >
              ← Back to Matches
            </Link>
          </div>
          <div className="rounded-xl border border-red-500/30 bg-red-900/10 p-4 text-red-300">
            {error}
          </div>
        </div>
      </div>
    );
  }

  if (!match) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-6">
        <div className="mx-auto max-w-5xl">
          <div className="rounded-xl border border-white/10 bg-zinc-900/40 p-6 text-zinc-300">
            Match not found.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-4">
          <Link
            to="/matches"
            className="text-sm text-zinc-400 hover:text-zinc-200"
          >
            ← Back to Matches
          </Link>
        </div>

        <MatchHeader
          match={match}
          onRefresh={refetch}
          refreshing={bgRefreshing}
          scorers={scorers}
          events={events}
        />

        <MatchTabs>
          <OverviewTab id="Overview" agg={agg} events={events} match={match} />
          <LineupsTab
            id="Lineups"
            lineups={lineups}
            formations={formations}
            homeName={match.home_team}
            awayName={match.away_team}
          />
          <StatsTab id="Stats" agg={agg} richStats={richStats} />
          <H2HTab id="H2H" h2h={h2h} />
          <PredictionBox id="Prediction" match={match} h2h={h2h} />
        </MatchTabs>
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="mx-auto max-w-5xl animate-pulse space-y-4">
      <div className="h-40 rounded-xl bg-zinc-800/60" />
      <div className="h-10 w-96 rounded-full bg-zinc-800/60" />
      <div className="h-72 rounded-xl bg-zinc-800/60" />
    </div>
  );
}
