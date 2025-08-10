// src/utils/performanceUtils.jsx - ZAMIJENI performanceUtils.js s ovim fajlom
import React from "react";

export class PerformanceMonitor {
  static timers = new Map();
  static rerenderCounts = new Map();

  static startTimer(label) {
    this.timers.set(label, performance.now());
  }

  static endTimer(label) {
    const start = this.timers.get(label);
    if (start) {
      const duration = performance.now() - start;
      console.log(`⏱️ ${label}: ${duration.toFixed(2)}ms`);
      this.timers.delete(label);
      return duration;
    }
  }

  static trackRerender(componentName) {
    const count = this.rerenderCounts.get(componentName) || 0;
    this.rerenderCounts.set(componentName, count + 1);

    if (count > 5) {
      console.warn(`🔄 ${componentName} re-rendered ${count + 1} times!`);
    }
  }

  static getStats() {
    return {
      rerenders: Object.fromEntries(this.rerenderCounts),
      activeTimers: Array.from(this.timers.keys()),
    };
  }

  static reset() {
    this.timers.clear();
    this.rerenderCounts.clear();
  }
}

// 🚀 CUSTOM HOOKS ZA PERFORMANCE
export function useRenderTracker(componentName) {
  React.useEffect(() => {
    if (import.meta.env.DEV) {
      PerformanceMonitor.trackRerender(componentName);
    }
  });
}

export function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = React.useState(value);

  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

export function useThrottle(callback, delay) {
  const lastRun = React.useRef(Date.now());

  return React.useCallback(
    (...args) => {
      if (Date.now() - lastRun.current >= delay) {
        callback(...args);
        lastRun.current = Date.now();
      }
    },
    [callback, delay]
  );
}

// 📦 GLOBAL CACHE
class GlobalCache {
  constructor() {
    this.cache = new Map();
    this.ttls = new Map();
  }

  set(key, value, ttl = 300000) {
    this.cache.set(key, value);
    this.ttls.set(key, Date.now() + ttl);
  }

  get(key) {
    const ttl = this.ttls.get(key);
    if (ttl && Date.now() > ttl) {
      this.delete(key);
      return undefined;
    }
    return this.cache.get(key);
  }

  delete(key) {
    this.cache.delete(key);
    this.ttls.delete(key);
  }

  clear() {
    this.cache.clear();
    this.ttls.clear();
  }

  cleanup() {
    const now = Date.now();
    for (const [key, ttl] of this.ttls.entries()) {
      if (now > ttl) {
        this.delete(key);
      }
    }
  }

  size() {
    return this.cache.size;
  }
}

export const globalCache = new GlobalCache();

// Cleanup interval
setInterval(() => {
  globalCache.cleanup();
}, 60000);

// 📊 PERFORMANCE DEBUGGER COMPONENT
export function PerformanceDebugger() {
  const [stats, setStats] = React.useState({});

  React.useEffect(() => {
    const interval = setInterval(() => {
      setStats(PerformanceMonitor.getStats());
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  if (!import.meta.env.DEV) return null;

  return (
    <div className="fixed bottom-4 right-4 bg-black text-white p-4 rounded-lg text-xs max-w-sm z-50">
      <h4 className="font-bold mb-2">🚀 Performance Stats</h4>
      <div>Cache size: {globalCache.size()}</div>
      <div>Active timers: {stats.activeTimers?.length || 0}</div>
      <div>Re-renders:</div>
      {Object.entries(stats.rerenders || {}).map(([comp, count]) => (
        <div key={comp} className="ml-2">
          {comp}: {count}
        </div>
      ))}
      <button
        onClick={() => PerformanceMonitor.reset()}
        className="mt-2 bg-red-600 px-2 py-1 rounded text-xs hover:bg-red-700"
      >
        Reset
      </button>
    </div>
  );
}
