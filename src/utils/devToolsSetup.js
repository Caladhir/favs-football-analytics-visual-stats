// src/utils/devToolsSetup.js

// Enable React DevTools profiling u development
if (import.meta.env.DEV) {
  // React Profiler setup
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__?.onCommitFiberRoot = function(
    id,
    root,
    priorityLevel
  ) {
    const fiberRoot = root.current;
    const actualDuration = fiberRoot.actualDuration;
    
    if (actualDuration > 16) { // >16ms je slow
      console.warn(`🐌 Slow render detected: ${actualDuration.toFixed(2)}ms`);
    }
  };

  // Memory usage monitoring
  const monitorMemory = () => {
    if (performance.memory) {
      const { usedJSHeapSize, totalJSHeapSize } = performance.memory;
      const usage = (usedJSHeapSize / totalJSHeapSize * 100).toFixed(1);
      
      if (usage > 80) {
        console.warn(`🧠 High memory usage: ${usage}%`);
      }
    }
  };

  setInterval(monitorMemory, 10000); // Check every 10s
}

// 📊 PERFORMANCE MEASUREMENT HOOKS

export function usePerformanceMeasure(name, dependencies = []) {
  React.useEffect(() => {
    performance.mark(`${name}-start`);
    
    return () => {
      performance.mark(`${name}-end`);
      performance.measure(name, `${name}-start`, `${name}-end`);
      
      const measure = performance.getEntriesByName(name, 'measure')[0];
      if (measure.duration > 1) {
        console.log(`⏱️ ${name}: ${measure.duration.toFixed(2)}ms`);
      }
    };
  }, dependencies);
}

// 🔍 COMPONENT PROFILING

export function withProfiler(WrappedComponent, name) {
  return function ProfiledComponent(props) {
    const renderCountRef = React.useRef(0);
    
    React.useEffect(() => {
      renderCountRef.current += 1;
      if (renderCountRef.current > 10) {
        console.warn(`🔄 ${name} rendered ${renderCountRef.current} times`);
      }
    });

    if (!import.meta.env.DEV) {
      return <WrappedComponent {...props} />;
    }

    return (
      <React.Profiler
        id={name}
        onRender={(id, phase, actualDuration) => {
          if (actualDuration > 5) {
            console.log(`🐌 ${id} (${phase}): ${actualDuration.toFixed(2)}ms`);
          }
        }}
      >
        <WrappedComponent {...props} />
      </React.Profiler>
    );
  };
}