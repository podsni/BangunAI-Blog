import { useState, useEffect } from "react";
import { Sun, Moon } from "lucide-react";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("theme") as "dark" | "light") || "dark";
    }
    return "dark";
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "light") {
      root.classList.add("light");
    } else {
      root.classList.remove("light");
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggle = () => setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  const nextTheme = theme === "dark" ? "terang" : "gelap";

  return (
    <button
      onClick={toggle}
      className="site-theme-toggle"
      aria-label={`Ganti ke mode ${nextTheme}`}
      title={`Ganti ke mode ${nextTheme}`}
    >
      <span className="relative block h-4 w-4 overflow-hidden" aria-hidden="true">
        <Sun
          size={16}
          className={`absolute inset-0 transition-all duration-500 ease-out ${
            theme === "light" ? "rotate-0 scale-100 opacity-100" : "rotate-90 scale-0 opacity-0"
          }`}
        />
        <Moon
          size={16}
          className={`absolute inset-0 transition-all duration-500 ease-out ${
            theme === "dark" ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0"
          }`}
        />
      </span>
    </button>
  );
}
