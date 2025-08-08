// src/features/homepage/FeatureCard.jsx
export function FeatureCard({ title, desc }) {
  return (
    <div className="bg-card p-6 rounded-xl shadow-md border border-border hover:scale-[1.02] transition-all duration-300 ease-in-out">
      <h3 className="text-xl font-bold mb-2">{title}</h3>
      <p className="text-muted-foreground">{desc}</p>
    </div>
  );
}
