/**
 * SavingsLeverageTooltip — Info icon with hover tooltip explaining the
 * Savings Leverage Ratio (储蓄杠杆比率).
 *
 * Behavior: 300ms hover delay, instant hide, positioned below the icon.
 */

import { useState, useRef, useCallback } from "react";

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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleEnter = useCallback(() => {
    timerRef.current = setTimeout(() => setShow(true), 300);
  }, []);

  const handleLeave = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setShow(false);
  }, []);

  return (
    <div
      style={{ position: "relative", display: "inline-flex", alignItems: "center" }}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      {/* Info icon */}
      <div
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
          cursor: "help",
          flexShrink: 0,
          lineHeight: 1,
        }}
      >
        i
      </div>

      {/* Tooltip */}
      {show && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: "0",
            
            width: 360,
            maxWidth: "calc(100vw - 32px)",
            background: "#ffffff",
            borderRadius: 12,
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.18), 0 2px 8px rgba(0, 0, 0, 0.08)",
            padding: "16px 18px",
            zIndex: 1000,
            pointerEvents: "none",
          }}
        >
          {TOOLTIP_SECTIONS.map((section, i) => (
            <div key={i} style={{ marginBottom: i < TOOLTIP_SECTIONS.length - 1 ? 12 : 0 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#1a1a1a",
                  marginBottom: 4,
                  lineHeight: 1.4,
                }}
              >
                {section.title}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "#555",
                  lineHeight: 1.6,
                  whiteSpace: "pre-line",
                }}
              >
                {section.desc}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
