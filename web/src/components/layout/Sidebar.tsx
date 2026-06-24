/**
 * Sidebar — premium navigation with smooth animations.
 * Features: grouped nav, tooltips on collapse, staggered entry, accent glow.
 */

import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Receipt,
  Wallet,
  Target,
  Calendar,
  TrendingUp,
  MessageSquare,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { useTranslation } from "../../i18n";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

// Nav item definition for grouped navigation
interface NavItem {
  to: string;
  icon: React.ComponentType<any>;
  labelKey: string;
}

// Core feature group
const coreNav: NavItem[] = [
  { to: "/", icon: LayoutDashboard, labelKey: "nav.dashboard" },
  { to: "/transactions", icon: Receipt, labelKey: "nav.transactions" },
  { to: "/budgets", icon: Wallet, labelKey: "nav.budgets" },
  { to: "/savings", icon: Target, labelKey: "nav.savings" },
];

// Analysis tools group
const analysisNav: NavItem[] = [
  { to: "/heatmap", icon: Calendar, labelKey: "nav.heatmap" },
  { to: "/stocks", icon: TrendingUp, labelKey: "nav.stocks" },
  { to: "/chat", icon: MessageSquare, labelKey: "nav.chat" },
];

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { t } = useTranslation();

  // Detect locale: if dashboard translation contains "Dashboard" → English
  const isEnglish = t("nav.dashboard").includes("Dashboard");

  const renderNavItem = (item: NavItem, index: number) => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.to === "/"}
      className={({ isActive }) =>
        `nav-item ${isActive ? "nav-item--active" : ""}`
      }
      style={{ animationDelay: `${index * 0.04}s` }}
      title={collapsed ? t(item.labelKey) : undefined}
    >
      <item.icon size={17} strokeWidth={1.8} style={{ flexShrink: 0 }} />
      {!collapsed && <span>{t(item.labelKey)}</span>}
    </NavLink>
  );

  return (
    <aside
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        height: "100vh",
        width: collapsed ? 64 : 210,
        background: "linear-gradient(180deg, #1a1816 0%, #151312 100%)",
        display: "flex",
        flexDirection: "column",
        zIndex: 50,
        transition: "width 0.3s cubic-bezier(0.25, 1, 0.5, 1)",
        overflow: "hidden",
        borderRight: "1px solid rgba(255, 255, 255, 0.06)",
      }}
    >
      {/* Brand area with gradient logo */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: collapsed ? "0 14px" : "0 16px",
          height: 56,
          borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
          flexShrink: 0,
          justifyContent: collapsed ? "center" : "flex-start",
        }}
      >
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            background: "linear-gradient(135deg, #2cb5ac 0%, #0d7377 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: 11,
            color: "#fff",
            flexShrink: 0,
            fontFamily: "var(--font-mono)",
            boxShadow: "0 2px 8px rgba(13, 115, 119, 0.3)",
          }}
        >
          SL
        </div>
        {!collapsed && (
          <span
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: "#ebe8e4",
              whiteSpace: "nowrap",
              fontFamily: "var(--font-display)",
              letterSpacing: "-0.01em",
            }}
          >
            Smart Ledger
          </span>
        )}
      </div>

      {/* Navigation groups */}
      <nav style={{ flex: 1, padding: "12px 0", overflowY: "auto" }}>
        {/* Core group */}
        <div style={{ marginBottom: 4 }}>
          {!collapsed && (
            <div
              style={{
                padding: "8px 20px 6px",
                fontSize: 10,
                fontWeight: 600,
                color: "#7a7269",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                fontFamily: "var(--font-mono)",
              }}
            >
              {isEnglish ? "CORE" : "核心"}
            </div>
          )}
          {coreNav.map((item, i) => renderNavItem(item, i))}
        </div>

        {/* Subtle divider between groups */}
        <div
          style={{
            margin: "8px 16px",
            height: 1,
            background: "rgba(255, 255, 255, 0.06)",
          }}
        />

        {/* Analysis group */}
        <div>
          {!collapsed && (
            <div
              style={{
                padding: "8px 20px 6px",
                fontSize: 10,
                fontWeight: 600,
                color: "#7a7269",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                fontFamily: "var(--font-mono)",
              }}
            >
              {isEnglish ? "ANALYSIS" : "分析"}
            </div>
          )}
          {analysisNav.map((item, i) =>
            renderNavItem(item, i + coreNav.length)
          )}
        </div>
      </nav>

      {/* Footer with version and collapse button */}
      <div
        style={{
          padding: collapsed ? "12px 0" : "12px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: collapsed ? "center" : "space-between",
          borderTop: "1px solid rgba(255, 255, 255, 0.06)",
          flexShrink: 0,
        }}
      >
        {!collapsed && (
          <span
            style={{
              fontSize: 10,
              color: "#6b635c",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              fontFamily: "var(--font-mono)",
            }}
          >
            v1.1.0
          </span>
        )}
        <button
          onClick={onToggle}
          style={{
            background: "rgba(255, 255, 255, 0.03)",
            border: "1px solid rgba(255, 255, 255, 0.06)",
            color: "#6b635c",
            cursor: "pointer",
            padding: 6,
            borderRadius: 6,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.2s cubic-bezier(0.25, 1, 0.5, 1)",
          }}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255, 255, 255, 0.06)";
            e.currentTarget.style.color = "#a09890";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(255, 255, 255, 0.03)";
            e.currentTarget.style.color = "#6b635c";
          }}
        >
          {collapsed ? <ChevronsRight size={14} /> : <ChevronsLeft size={14} />}
        </button>
      </div>
    </aside>
  );
}
