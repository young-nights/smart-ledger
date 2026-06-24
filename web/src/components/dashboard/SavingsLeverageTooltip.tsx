/**
 * SavingsLeverageTooltip — Info icon with hover tooltip.
 * Renders tooltip via React Portal to escape all parent overflow containers.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";

const TOOLTIP_SECTIONS = [
  {
    title: "最直观的「节流效果」指标",
    desc: "它把重点放在支出侧（分母），比单纯看储蓄率更能体现你控制生活成本的能力。",
  },
  {
    title: "财富积累速度的相对度量",
    desc: "比率越高，说明你用当前生活水平「覆盖」储蓄的能力越强。结合投资复利，能更快把净资产推向FIRE目标（年支出×25）。",
  },
  {
    title: "与资产负债表的联动",
    desc: "• 净储蓄本身已经是考虑资产负债变化后的净结果（收入减去所有支出，包括债务利息）\n• 还债本金部分会增加净资产，属于隐性储蓄\n• 这个比率越高 → 每月能投入可投资资产的金额相对你的生活成本就越多 → 净资产增长越快",
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
