/**
 * Theme toggle — switches between light and dark mode.
 * Editorial style: clean, minimal.
 */

import { useState, useEffect } from "react";
import { Sun, Moon } from "lucide-react";

const THEME_KEY = "smart-ledger-theme";

type Theme = "light" | "dark";

function getSystemTheme(): Theme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function getStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // ignore
  }
  return getSystemTheme();
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getStoredTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // ignore
    }
  }, [theme]);

  const toggle = () => setTheme((t) => (t === "light" ? "dark" : "light"));

  return (
    <button
      onClick={toggle}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 32,
        height: 32,
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
        background: "transparent",
        color: "var(--text-secondary)",
        cursor: "pointer",
        transition: "color 0.15s, border-color 0.15s",
      }}
      title={
        theme === "light" ? "Switch to dark mode" : "Switch to light mode"
      }
      aria-label="Toggle theme"
    >
      {theme === "light" ? <Moon size={15} /> : <Sun size={15} />}
    </button>
  );
}
