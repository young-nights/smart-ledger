/**
 * Calendar — Premium date picker with month navigation.
 * Click to select date, click again to clear.
 */

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface CalendarProps {
  selected?: Date | null;
  onSelect?: (date: Date | null) => void;
  onToday?: () => void;
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

export function Calendar({ selected, onSelect, onToday }: CalendarProps) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(selected?.getFullYear() ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(selected?.getMonth() ?? today.getMonth());

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth);

  const handlePrev = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const handleNext = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const handleDayClick = (day: number) => {
    const clicked = new Date(viewYear, viewMonth, day);
    // If clicking the same date, clear selection
    if (
      selected &&
      selected.getFullYear() === viewYear &&
      selected.getMonth() === viewMonth &&
      selected.getDate() === day
    ) {
      onSelect?.(null);
    } else {
      onSelect?.(clicked);
    }
  };

  const handleToday = () => {
    if (onToday) {
      onToday();
    } else {
      setViewYear(today.getFullYear());
      setViewMonth(today.getMonth());
      onSelect?.(today);
    }
  };

  return (
    <div
      style={{
        background: "var(--bg-surface)",
        borderRadius: 12,
        border: "1px solid var(--border-subtle)",
        padding: 16,
        width: 300,
        boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
      }}
    >
      {/* Header — month navigation */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <button
          onClick={handlePrev}
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            border: "none",
            background: "var(--bg-page)",
            color: "var(--text-secondary)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.15s",
          }}
        >
          <ChevronLeft size={16} />
        </button>

        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
          {viewYear}年{viewMonth + 1}月
        </span>

        <button
          onClick={handleNext}
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            border: "none",
            background: "var(--bg-page)",
            color: "var(--text-secondary)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.15s",
          }}
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Today button */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <button
          onClick={handleToday}
          style={{
            padding: "4px 12px",
            fontSize: 11,
            borderRadius: 6,
            border: "1px solid var(--border-subtle)",
            background: "transparent",
            color: "var(--text-secondary)",
            cursor: "pointer",
            transition: "all 0.15s",
          }}
        >
          今天
        </button>
      </div>

      {/* Weekday headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            style={{
              textAlign: "center",
              fontSize: 11,
              color: "var(--text-tertiary)",
              fontWeight: 500,
              padding: "4px 0",
            }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
        {/* Empty cells for offset */}
        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}

        {/* Day cells */}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const isToday =
            today.getFullYear() === viewYear &&
            today.getMonth() === viewMonth &&
            today.getDate() === day;
          const isSelected =
            selected &&
            selected.getFullYear() === viewYear &&
            selected.getMonth() === viewMonth &&
            selected.getDate() === day;

          return (
            <button
              key={day}
              onClick={() => handleDayClick(day)}
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                border: "none",
                fontSize: 13,
                fontWeight: isSelected ? 600 : 400,
                cursor: "pointer",
                transition: "all 0.15s",
                background: isSelected
                  ? "var(--color-primary)"
                  : isToday
                    ? "var(--color-primary-light)"
                    : "transparent",
                color: isSelected
                  ? "white"
                  : isToday
                    ? "var(--color-primary)"
                    : "var(--text-primary)",
              }}
            >
              {day}
            </button>
          );
        })}
      </div>

      {/* Selected date display */}
      {selected && (
        <div
          style={{
            marginTop: 12,
            padding: "8px 12px",
            background: "var(--bg-page)",
            borderRadius: 8,
            fontSize: 12,
            color: "var(--text-secondary)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>
            已选: {selected.getFullYear()}/{String(selected.getMonth() + 1).padStart(2, "0")}/{String(selected.getDate()).padStart(2, "0")}
          </span>
          <button
            onClick={() => onSelect?.(null)}
            style={{
              fontSize: 11,
              color: "var(--color-danger)",
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
          >
            清除
          </button>
        </div>
      )}
    </div>
  );
}
