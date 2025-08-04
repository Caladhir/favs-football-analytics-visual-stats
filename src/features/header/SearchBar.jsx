import { useState, useRef } from "react";
import { Icon } from "@iconify-icon/react";

export default function SearchBar({ className = "" }) {
  const inputRef = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");

  const open = () => {
    setExpanded(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const close = () => {
    setExpanded(false);
    setQuery("");
  };

  const onSubmit = (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    console.log("Traži:", query); // TODO: implementiraj tražilicu
    close();
  };

  const computedWidth = expanded ? "min(40rem, 100vw - 2rem)" : "3.5rem";

  return (
    <div
      className={` transition-[width]  duration-300 ease-out ${className}`}
      style={{ width: computedWidth }}
    >
      {!expanded && (
        <button
          onClick={open}
          className="w-full h-14 flex items-center justify-center rounded-full hover:bg-slate-400/40 transition"
        >
          <Icon
            icon="jam:search"
            width={28}
            height={28}
            className="text-red-500 text-outline"
          />
        </button>
      )}

      {expanded && (
        <form onSubmit={onSubmit} className="relative">
          <input
            ref={inputRef}
            type="text"
            placeholder="Search players, teams, matches…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onBlur={() => !query && close()}
            className="w-full h-14 bg-black/70 text-lg text-white placeholder-white/40 rounded-full pl-16 pr-12 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <Icon
            icon="jam:search"
            width="28"
            height="28"
            className="absolute left-5 top-1/2 -translate-y-1/2 text-white/75 pointer-events-none"
          />
          <Icon
            icon="mdi:close"
            width="20"
            height="20"
            onClick={close}
            className="absolute right-4 top-1/2 -translate-y-1/2 cursor-pointer hover:opacity-80 text-white/80"
          />
        </form>
      )}
    </div>
  );
}
