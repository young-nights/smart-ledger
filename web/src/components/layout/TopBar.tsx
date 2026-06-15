/**
 * TopBar — editorial header with serif title, search, and controls.
 * Clean, minimal. No heavy borders.
 */

import { useState, useRef, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Search, Download } from "lucide-react";
import { ThemeToggle } from "../ui/ThemeToggle";
import { LanguageToggle } from "../../i18n/LanguageToggle";
import { useTranslation } from "../../i18n";
import { getExportCSVUrl } from "../../lib/api";

export function TopBar() {
  const location = useLocation();
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const pageTitles: Record<string, string> = {
    "/": t("nav.dashboard"),
    "/transactions": t("nav.transactions"),
    "/budgets": t("nav.budgets"),
    "/savings": t("nav.savings"),
    "/heatmap": t("nav.heatmap"),
    "/report": t("nav.reports"),
    "/chat": t("nav.chat"),
  };

  const title = pageTitles[location.pathname] || "Smart Ledger";

  // ⌘K / Ctrl+K shortcut to focus search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <header className="topbar">
      <h1
        style={{
          fontSize: 20,
          fontWeight: 600,
          color: "var(--text-primary)",
          fontFamily: "var(--font-display)",
          letterSpacing: "-0.02em",
        }}
      >
        {title}
      </h1>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {/* Search bar */}
        <div className="search-wrapper">
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder={t("common.search")}
            className="search-input"
          />
          <Search size={16} className="search-icon" />
          {!searchFocused && !query && (
            <span className="search-shortcut">⌘K</span>
          )}
        </div>

        <a
          href={getExportCSVUrl()}
          target="_blank"
          rel="noopener noreferrer"
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
            textDecoration: "none",
          }}
          title={t("common.export") + " CSV"}
        >
          <Download size={15} />
        </a>

        <LanguageToggle />
        <ThemeToggle />
      </div>
    </header>
  );
}
