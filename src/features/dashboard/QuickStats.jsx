// src/features/dashboard/QuickStats.jsx
export default function QuickStats() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
      <div className="p-6 bg-card rounded shadow text-center">
        Total Matches
      </div>
      <div className="p-6 bg-card rounded shadow text-center">Average xG</div>
      <div className="p-6 bg-card rounded shadow text-center">
        Active Players
      </div>
      <div className="p-6 bg-card rounded shadow text-center">AI Accuracy</div>
    </div>
  );
}
