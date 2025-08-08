// src/App.jsx
import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import Spinner from "./ui/Spinner";
import PerformanceMonitor from "./ui/PerformanceMonitor";

// Lazy load layout and pages
const AppLayout = lazy(() => import("./ui/AppLayout"));
const HomePage = lazy(() => import("./pages/app_layout/HomePage"));
const Matches = lazy(() => import("./pages/app_layout/Matches"));
const LiveMatches = lazy(() => import("./features/tabs/LiveMatches"));
const Dashboard = lazy(() => import("./pages/app_layout/Dashboard"));
const PageNotFound = lazy(() => import("./pages/NotFound"));

export default function App() {
  return (
    <BrowserRouter>
      <Suspense
        fallback={<Spinner size={48} className="fixed inset-0 m-auto" />}
      >
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" index element={<HomePage />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/matches" element={<Matches />} />
            <Route path="/matches/live" element={<LiveMatches />} />
            <Route path="/matches/upcoming" element={<Matches />} />
            <Route path="/matches/finished" element={<Matches />} />
            <Route path="*" element={<PageNotFound />} />
          </Route>
        </Routes>
      </Suspense>

      <Toaster
        position="bottom-right"
        gutter={12}
        containerStyle={{ margin: "8px" }}
        toastOptions={{
          style: {
            background: "#121212",
            color: "white",
            border: "none",
            boxShadow: "0 2px 12px rgba(0, 0, 0, 0.4)",
          },
          success: { duration: 3000 },
          error: { duration: 5000 },
        }}
      />
      <PerformanceMonitor />
    </BrowserRouter>
  );
}
