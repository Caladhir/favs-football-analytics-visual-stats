// src/App.jsx
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { Toaster } from "react-hot-toast";

// Components
import AppLayout from "./ui/AppLayout";
import HomePage from "./pages/app_layout/HomePage";
import Dashboard from "./pages/app_layout/Dashboard";
import Matches from "./pages/app_layout/Matches";
import Players from "./pages/app_layout/Players";
import Teams from "./pages/app_layout/Teams";

import MatchPage from "./pages/app_layout/MatchPage";

import NotFound from "./pages/NotFound";
import ScrollToTop from "./ui/ScrollToTop";

export default function App() {
  return (
    <Router>
      <div className="min-h-screen bg-background text-foreground">
        <ScrollToTop />

        <Routes>
          <Route path="/" element={<AppLayout />}>
            <Route index element={<HomePage />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="matches/*" element={<Matches />} />
            <Route path="match/:id" element={<MatchPage />} />
            <Route path="players" element={<Players />} />
            <Route path="teams" element={<Teams />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>

        {/* Toast notifications */}
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: "hsl(var(--background))",
              color: "hsl(var(--foreground))",
              border: "1px solid hsl(var(--border))",
            },
          }}
        />

        {/* 🚀 PERFORMANCE DEBUGGER - samo u development */}
      </div>
    </Router>
  );
}
