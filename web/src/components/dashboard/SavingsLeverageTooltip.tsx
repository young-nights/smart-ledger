/**
 * SavingsLeverageTooltip — Info icon with hover tooltip.
 * Renders tooltip via React Portal to escape all parent overflow containers.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";

const TOOLTIP_SECTIONS = [
  {
    title: "净储蓄率（非月收入储蓄率）",
    desc: "公式：净储蓄 ÷ 支出 × 100%。净储蓄 = 实际本金 + 投资收益（A股/美股持仓同步），与储蓄目标一致。不是记账里的收入减支出。",
  },
  {
    title: "财富积累速度的相对度量",
    desc: "比率越高，说明你用当前生活水平「覆盖」储蓄的能力越强。结合投资复利，能更快把净资产推向FIRE目标（年支出×25）。",
  },
  {
    title: "与储蓄目标联动",
    desc: "• 净储蓄率随储蓄目标金额与持仓盈亏同步自动更新\n• 已储蓄金额在储蓄目标页维护；投资收益通过「持仓盈亏同步」或刷新股价更新\n• 比率越高 → 已积累储蓄相对当期支出越多 → 财务安全边际越高",
  },
  {
    title: "FIRE规划中的实用价值",
    desc: "• 比率 = 1 → 每年能存下约1年的生活支出\n• 比率 = 2 → 每年能存下约2年的生活支出\n• 结合4%法则，能快速估算自己距离财务自由还有多远",
  },
];

export function SavingsLeverageTooltip() {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const iconRef = useRef<HTMLDivElement>(null);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = () => {
    if (showTimerRef.current) { clearTimeout(showTimerRef.current); showTimerRef.current = null; }
    if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
  };

  const calcPos = useCallback(() => {
    if (!iconRef.current) return;
    const r = iconRef.current.getBoundingClientRect();
    const tw = 360;
    let x = r.left;
    let y = r.bottom + 8;
    if (x + tw > window.innerWidth - 8) x = window.innerWidth - tw - 8;
    if (x < 8) x = 8;
    if (y + 300 > window.innerHeight - 8) y = r.top - 8 - 300;
    setPos({ x, y });
  }, []);

  const scheduleShow = useCallback(() => {
    clearTimers();
    showTimerRef.current = setTimeout(() => {
      calcPos();
      setShow(true);
    }, 300);
  }, [calcPos]);

  const scheduleHide = useCallback((ms = 150) => {
    clearTimers();
    hideTimerRef.current = setTimeout(() => setShow(false), ms);
  }, []);

  // Recalc position on scroll/resize while visible
  useEffect(() => {
    if (!show) return;
    const onMove = () => calcPos();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [show, calcPos]);

  // Cleanup on unmount
  useEffect(() => () => clearTimers(), []);

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        position: "relative",
        // Expand clickable area without visually enlarging the icon
        padding: "8px",
        margin: "-8px",
        cursor: "help",
        verticalAlign: "middle",
      }}
      onMouseEnter={scheduleShow}
      onMouseLeave={() => scheduleHide(200)}
    >
      {/* Icon */}
      <div
        ref={iconRef}
        style={{
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "#6b7280",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 10,
          fontWeight: 700,
          color: "#ffffff",
          flexShrink: 0,
          lineHeight: 1,
        }}
      >
        i
      </div>

      {/* Tooltip via portal */}
      {show && createPortal(
        <div
          style={{
            position: "fixed",
            top: pos.y,
            left: pos.x,
            width: 360,
            maxWidth: "min(360px, calc(100vw - 32px))",
            background: "#ffffff",
            borderRadius: 12,
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.18), 0 2px 8px rgba(0, 0, 0, 0.08)",
            padding: "16px 18px",
            zIndex: 10000,
          }}
          onMouseEnter={() => clearTimers()}
          onMouseLeave={() => scheduleHide(100)}
        >
          {TOOLTIP_SECTIONS.map((section, i) => (
            <div key={i} style={{ marginBottom: i < TOOLTIP_SECTIONS.length - 1 ? 12 : 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#1a1a1a", marginBottom: 4, lineHeight: 1.4 }}>
                {section.title}
              </div>
              <div style={{ fontSize: 12, color: "#555", lineHeight: 1.6, whiteSpace: "pre-line" }}>
                {section.desc}
              </div>
            </div>
          ))}
        </div>,
        document.body
      )}
    </span>
  );
}
