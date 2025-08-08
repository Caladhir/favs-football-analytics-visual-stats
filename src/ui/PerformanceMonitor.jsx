// src/components/PerformanceMonitor.jsx
import { useState, useEffect, useRef } from "react";

export default function PerformanceMonitor() {
  const [metrics, setMetrics] = useState({
    fps: 0,
    renderTime: 0,
    memoryUsage: 0,
    loadTime: 0,
  });
  const [isVisible, setIsVisible] = useState(false);
  const frameCount = useRef(0);
  const lastTime = useRef(performance.now());

  useEffect(() => {
    // FPS Counter
    const measureFPS = () => {
      frameCount.current++;
      const now = performance.now();

      if (now - lastTime.current >= 1000) {
        setMetrics((prev) => ({
          ...prev,
          fps: Math.round(
            (frameCount.current * 1000) / (now - lastTime.current)
          ),
        }));
        frameCount.current = 0;
        lastTime.current = now;
      }

      requestAnimationFrame(measureFPS);
    };

    // Memory Usage (ako je dostupno)
    const measureMemory = () => {
      if (performance.memory) {
        setMetrics((prev) => ({
          ...prev,
          memoryUsage: Math.round(
            performance.memory.usedJSHeapSize / 1024 / 1024
          ),
        }));
      }
    };

    // Page Load Time
    const measureLoadTime = () => {
      const loadTime =
        performance.timing.loadEventEnd - performance.timing.navigationStart;
      setMetrics((prev) => ({
        ...prev,
        loadTime: Math.round(loadTime),
      }));
    };

    measureFPS();
    measureMemory();
    measureLoadTime();

    const interval = setInterval(measureMemory, 2000);
    return () => clearInterval(interval);
  }, []);

  // Keyboard shortcut za toggle (Ctrl+Shift+P)
  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === "P") {
        setIsVisible((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, []);

  if (!import.meta.env.DEV || !isVisible) return null;

  return (
    <div className="fixed top-4 right-4 bg-black/80 text-white p-3 rounded-lg text-xs font-mono z-[9999] backdrop-blur-sm">
      <div className="flex justify-between items-center mb-2">
        <span className="font-bold">Performance</span>
        <button
          onClick={() => setIsVisible(false)}
          className="text-red-400 hover:text-red-300"
        >
          ×
        </button>
      </div>

      <div className="space-y-1">
        <div className="flex justify-between">
          <span>FPS:</span>
          <span
            className={
              metrics.fps < 30
                ? "text-red-400"
                : metrics.fps < 50
                ? "text-yellow-400"
                : "text-green-400"
            }
          >
            {metrics.fps}
          </span>
        </div>

        <div className="flex justify-between">
          <span>Memory:</span>
          <span
            className={
              metrics.memoryUsage > 100 ? "text-red-400" : "text-green-400"
            }
          >
            {metrics.memoryUsage}MB
          </span>
        </div>

        <div className="flex justify-between">
          <span>Load:</span>
          <span
            className={
              metrics.loadTime > 3000 ? "text-red-400" : "text-green-400"
            }
          >
            {metrics.loadTime}ms
          </span>
        </div>
      </div>

      <div className="text-[10px] text-gray-400 mt-2">
        Ctrl+Shift+P to toggle
      </div>
    </div>
  );
}
