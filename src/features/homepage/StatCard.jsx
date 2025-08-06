// src/features/homepage/StatCard.jsx
export function StatCard({ number, label }) {
  return (
    <div className="text-center">
      <div className="text-4xl font-extrabold text-primary">{number}</div>
      <div className="text-sm text-muted-foreground mt-1">{label}</div>
    </div>
  );
}
