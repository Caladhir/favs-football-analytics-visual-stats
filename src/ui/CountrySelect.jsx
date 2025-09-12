import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search } from 'lucide-react';

/**
 * CountrySelect – searchable dropdown for large country lists.
 * Props:
 *  - value: current selected id (string)
 *  - options: array<string> including 'all'
 *  - onChange(id)
 */
export default function CountrySelect({ value, options = [], onChange, placeholder = 'All Countries' }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef(null);

  const filtered = options.filter(o => !query.trim() || o.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    const handler = (e) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target)) setOpen(false);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => { setQuery(''); }, [open]);

  const labelFor = (opt) => opt === 'all' ? placeholder : opt;

  return (
  <div className="relative w-full md:w-56 z-50" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-sm md:text-base transition-colors focus:outline-none focus:ring-2 focus:ring-red-500/50
          ${open ? 'border-red-500/50 bg-white/15' : 'border-white/10 bg-white/10 hover:bg-white/15'}
          text-gray-200`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{labelFor(value)}</span>
        <ChevronDown className={`w-4 h-4 ml-2 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-50 mt-2 w-full max-h-72 rounded-lg overflow-hidden border border-white/10 shadow-xl backdrop-blur-xl bg-gray-900/90">
          <div className="p-2 border-b border-white/10 flex items-center gap-2">
            <Search className="w-4 h-4 text-gray-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter..."
              className="flex-1 bg-transparent text-sm text-gray-200 placeholder-gray-500 focus:outline-none"
            />
          </div>
          <ul role="listbox" className="max-h-60 overflow-y-auto custom-scrollbar text-sm">
            {filtered.map(opt => (
              <li key={opt}>
                <button
                  onClick={() => { onChange(opt); setOpen(false); }}
                  className={`w-full text-left px-3 py-2 hover:bg-red-500/20 focus:bg-red-500/30 focus:outline-none transition-colors ${opt === value ? 'text-white font-medium bg-red-500/30' : 'text-gray-300'}`}
                  role="option"
                  aria-selected={opt === value}
                >
                  {labelFor(opt)}
                </button>
              </li>
            ))}
            {!filtered.length && (
              <li className="px-3 py-2 text-gray-500 italic">No matches</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
