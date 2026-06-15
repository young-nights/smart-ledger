/**
 * Spending Heatmap — calendar view, editorial layout.
 * No card wrappers. Clean grid with section headers.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { Calendar } from "lucide-react";
import { useTranslation } from "../i18n";
import { fetchHeatmap, fetchTransactions } from "../lib/api";
import type { HeatmapDay, Transaction } from "../lib/types";

const DAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];
const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function getHeatColor(value: number, max: number): string {
  if (value === 0 || max === 0) return "var(--border-light)";
  const ratio = Math.min(value / max, 1);
  if (ratio < 0.2) return "#c4e0e1";
  if (ratio < 0.4) return "#8cc5c8";
  if (ratio < 0.6) return "#4da8ac";
  if (ratio < 0.8) return "#1d8c90";
  return "#0d6b6e";
}

function buildCalendarDays(year: number): (Date | null)[] {
  const days: (Date | null)[] = [];
  const firstDay = new Date(year, 0, 1);
  const startPad = firstDay.getDay();
  for (let i = 0; i < startPad; i++) days.push(null);

  const lastDay = new Date(year, 11, 31);
  const current = new Date(firstDay);
  while (current <= lastDay) {
    days.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return days;
}

export default function Heatmap() {
  const { t } = useTranslation();
  const [year, setYear] = useState(new Date().getFullYear());
  const [heatmapData, setHeatmapData] = useState<HeatmapDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dayTxns, setDayTxns] = useState<Transaction[]>([]);
  const [availableYears, setAvailableYears] = useState<number[]>([]);

  // Fetch available years from transactions
  useEffect(() => {
    fetchTransactions()
      .then((txns) => {
        const currentYear = new Date().getFullYear();
        const years = new Set<number>();
        txns.forEach((t) => {
          const y = parseInt(t.date.slice(0, 4));
          if (y <= currentYear) years.add(y);
        });
        const sorted = Array.from(years).sort((a, b) => b - a);
        setAvailableYears(sorted);
        // Set year to the most recent year with data if current year has no data
        if (sorted.length > 0 && !sorted.includes(year)) {
          setYear(sorted[0]);
        }
      })
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setHeatmapData(await fetchHeatmap(year));
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    load();
  }, [load]);

  const dataMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of heatmapData) {
      map.set(d.date, d.total);
    }
    return map;
  }, [heatmapData]);

  const maxVal = useMemo(
    () => Math.max(...heatmapData.map((d) => d.total), 1),
    [heatmapData]
  );

  const calendarDays = useMemo(() => buildCalendarDays(year), [year]);

  useEffect(() => {
    if (!selectedDate) {
      setDayTxns([]);
      return;
    }
    fetchTransactions(undefined, undefined)
      .then((txns) => {
        setDayTxns(txns.filter((t) => t.date === selectedDate));
      })
      .catch(() => setDayTxns([]));
  }, [selectedDate]);

  // Group into weeks
  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < calendarDays.length; i += 7) {
    weeks.push(calendarDays.slice(i, i + 7));
  }

  const monthLabels = useMemo(() => {
    const labels: { col: number; label: string }[] = [];
    let lastMonth = -1;
    weeks.forEach((week, col) => {
      const firstDay = week.find((d) => d !== null);
      if (firstDay) {
        const m = firstDay.getMonth();
        if (m !== lastMonth) {
          labels.push({ col, label: MONTH_LABELS[m] });
          lastMonth = m;
        }
      }
    });
    return labels;
  }, [weeks]);

  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <section
        className="section"
        style={{
          paddingTop: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Calendar size={18} style={{ color: "var(--color-primary)" }} />
          <h2 style={{ fontSize: "1.5rem" }}>{t("heatmap.title")}</h2>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {availableYears.map((y) => (
            <button
              key={y}
              className={`btn ${y === year ? "btn-primary" : "btn-ghost"}`}
              style={{ padding: "4px 12px", fontSize: 12 }}
              onClick={() => setYear(y)}
            >
              {y}
            </button>
          ))}
        </div>
      </section>

      {loading ? (
        <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
          {t("common.loading")}
        </p>
      ) : (
        <section className="section-card">
          <div className="elevated-card" style={{ overflow: "auto" }}>
          {/* Month labels */}
          <div
            style={{
              display: "flex",
              marginBottom: 4,
              paddingLeft: 32,
              position: "relative",
            }}
          >
            {monthLabels.map((m, i) => (
              <span
                key={i}
                style={{
                  fontSize: 10,
                  color: "var(--text-tertiary)",
                  position: "absolute",
                  left: `${32 + m.col * 16}px`,
                }}
              >
                {m.label}
              </span>
            ))}
          </div>

          {/* Grid */}
          <div style={{ display: "flex", gap: 3, marginTop: 16 }}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 3,
                marginRight: 6,
              }}
            >
              {DAY_LABELS.map((label, i) => (
                <div
                  key={i}
                  style={{
                    width: 24,
                    height: 14,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-end",
                    fontSize: 10,
                    color: "var(--text-tertiary)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {label}
                </div>
              ))}
            </div>

            {weeks.map((week, wi) => (
              <div
                key={wi}
                style={{ display: "flex", flexDirection: "column", gap: 2 }}
              >
                {week.map((day, di) => {
                  if (!day) {
                    return <div key={di} style={{ width: 20, height: 20 }} />;
                  }
                  const dateStr = day.toISOString().slice(0, 10);
                  const value = dataMap.get(dateStr) || 0;
                  const isSelected = selectedDate === dateStr;

                  return (
                    <div
                      key={di}
                      className="heatmap-cell"
                      style={{
                        background: getHeatColor(value, maxVal),
                        cursor: "pointer",
                        outline: isSelected
                          ? "2px solid var(--color-primary)"
                          : "none",
                        outlineOffset: 1,
                      }}
                      title={`${dateStr}: ¥${value.toFixed(0)}`}
                      onClick={() =>
                        setSelectedDate(
                          selectedDate === dateStr ? null : dateStr
                        )
                      }
                    />
                  );
                })}
              </div>
            ))}
          </div>

          {/* Legend */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              marginTop: 12,
              fontSize: 11,
              color: "var(--text-tertiary)",
            }}
          >
            <span>{t("heatmap.less")}</span>
            {[0, 0.2, 0.4, 0.6, 0.8, 1].map((ratio, i) => (
              <div
                key={i}
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 3,
                  background:
                    ratio === 0
                      ? "var(--border-light)"
                      : getHeatColor(ratio * maxVal, maxVal),
                }}
              />
            ))}
            <span>{t("heatmap.more")}</span>
          </div>
          </div>
        </section>
      )}

      {/* Selected day transactions — elevated card */}
      {selectedDate && (
        <section className="section-card">
          <div className="elevated-card">
          <h4 style={{ marginBottom: 12 }}>
            {t("heatmap.txnOn")}
            {selectedDate}
          </h4>
          {dayTxns.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
              {t("heatmap.noTxnOnDay")}
            </p>
          ) : (
            <div>
              {dayTxns.map((txn) => (
                <div
                  key={txn.id}
                  className="table-row"
                  style={{ padding: "10px 0" }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      flex: 1,
                      minWidth: 0,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        color: "var(--color-primary)",
                        background: "var(--color-primary-light)",
                        padding: "2px 8px",
                        borderRadius: 4,
                        flexShrink: 0,
                      }}
                    >
                      {txn.category}
                    </span>
                    <span
                      style={{
                        fontSize: 13,
                        color: "var(--text-primary)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {txn.description || txn.raw_input}
                    </span>
                  </div>
                  <span
                    className="num-display"
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: txn.is_income
                        ? "var(--color-success)"
                        : "var(--text-primary)",
                      flexShrink: 0,
                    }}
                  >
                    {txn.is_income ? "+" : "-"}¥{txn.abs_amount.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          )}
          </div>
        </section>
      )}
    </div>
  );
}
