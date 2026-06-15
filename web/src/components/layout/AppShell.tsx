/**
 * AppShell — main layout shell with sidebar, topbar, and content area.
 * Editorial layout: generous padding, clean separation.
 */

import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { QuickActions } from "../dashboard/QuickActions";

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false);
  const sidebarWidth = collapsed ? 64 : 210;

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          marginLeft: sidebarWidth,
          transition: "margin-left 0.3s cubic-bezier(0.25, 1, 0.5, 1)",
          minWidth: 0,
          background: "var(--bg-page)",
        }}
      >
        <TopBar />
        <main
          className="page"
          style={{
            flex: 1,
            overflowY: "auto",
            overflowX: "hidden",
          }}
        >
          <Outlet />
        </main>
      </div>
      <QuickActions />
    </div>
  );
}
