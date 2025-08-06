// src/ui/Button.jsx
export function Button({ children, className = "", ...props }) {
  return (
    <button
      className={`bg-primary text-white px-4 py-2 rounded hover:opacity-90 transition ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
