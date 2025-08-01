import { Icon } from "@iconify-icon/react";
import { useState, useEffect } from "react";

function ThemeToggleButton({ className = "" }) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const darkMode = document.documentElement.classList.contains("dark");
    setIsDark(darkMode);
  }, []);

  const toggleTheme = () => {
    document.documentElement.classList.toggle("dark");
    setIsDark((prev) => !prev);
  };

  return (
    <button
      onClick={toggleTheme}
      className={`flex items-center gap-2 px-3 py-2 rounded hover:bg-muted transition ${className}`}
    >
      <Icon
        icon={isDark ? "mdi:weather-sunny" : "mdi:weather-night"}
        width={22}
      />
      <span>{isDark ? "Light mode" : "Dark mode"}</span>
    </button>
  );
}

export default ThemeToggleButton;
