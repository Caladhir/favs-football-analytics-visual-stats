// src/features/homepage/QuickLink.jsx
export function QuickLink({ title }) {
  return (
    <div className="bg-muted text-muted-foreground px-6 py-4 rounded shadow hover:bg-accent transition">
      <p className="font-semibold">{title}</p>
    </div>
  );
}
