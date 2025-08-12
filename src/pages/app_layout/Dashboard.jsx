// src/pages/app_layout/Dashboard.jsx
import QuickStats from "../../features/dashboard/QuickStats";
import StatOfTheDay from "../../features/dashboard/StatOfTheDay";
import UpsetAlert from "../../features/dashboard/UpsetAlert";
import FormGuide from "../../features/dashboard/FormGuide";
import LiveResults from "../../features/dashboard/LiveResults";
import TopScorers from "../../features/dashboard/TopScorers";
import LeagueTable from "../../features/dashboard/LeagueTable";
import XgVsGoals from "../../features/dashboard/XgVsGoals";
import BestWorstPerformers from "../../features/dashboard/BestWorstPerformers";
import ActivityHeatmap from "../../features/dashboard/ActivityHeatmap";

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <section className="text-center mt-8">
        <h1 className="text-4xl font-bold text-primary text-outline mb-2">
          Analytics Dashboard
        </h1>
        <p className="text-muted-foreground text-sm">
          Pregled ključnih metrika, trendova i live podataka.
        </p>
      </section>

      <div className="container mx-auto px-6 py-8 space-y-8">
        <QuickStats />

        {/* Insights trio */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatOfTheDay />
          <UpsetAlert />
          <FormGuide />
        </div>

        {/* Live + Scorers */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <LiveResults />
          <TopScorers />
        </div>

        {/* League + xG */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <LeagueTable />
          <XgVsGoals />
        </div>

        {/* Best/Worst + Heatmap */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <BestWorstPerformers />
          <ActivityHeatmap />
        </div>
      </div>
    </div>
  );
}
