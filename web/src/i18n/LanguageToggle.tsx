/**
 * LanguageToggle — button to switch between Chinese and English.
 * Editorial style: clean, minimal.
 */

import { useTranslation } from "./index";

export function LanguageToggle() {
  const { locale, toggleLocale } = useTranslation();

  return (
    <button
      onClick={toggleLocale}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 12px",
        borderRadius: 6,
        border: "1px solid var(--border)",
        background: "transparent",
        color: "var(--text-secondary)",
        fontSize: 13,
        fontWeight: 500,
        cursor: "pointer",
        transition: "all 0.15s var(--ease-out-quart)",
      }}
      title={locale === "zh" ? "Switch to English" : "切换到中文"}
    >
      <span>{locale === "zh" ? "中文" : "EN"}</span>
    </button>
  );
}
