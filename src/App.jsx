import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import HomePage from "./pages/app_layout/HomePage";
import MatchPage from "./pages/app_layout/MatchPage";
import AppLayout from "./ui/AppLayout";

function App() {
  return (
    <Router>
      <AppLayout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/match/:id" element={<MatchPage />} />
        </Routes>
      </AppLayout>
    </Router>
  );
}

export default App;
