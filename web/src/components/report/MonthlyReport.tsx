/**
 * MonthlyReport — editorial layout with sections.
 * No card wrappers. Left accents for alerts and advice.
 */

import type { ReportData } from "../../lib/types";
import { Badge } from "../ui/Badge";
import { BudgetProgress } from "../budget/BudgetProgress";
import { useTranslation } from "../../i18n";

interface MonthlyReportProps {
  report: ReportData;
}

const gradeBadge: Record<string, "success" | "warning" | "danger" | "info"> = {
  优秀: "success",
  良好: "info",
  警告: "warning",
  危险: "danger",
};

export function MonthlyReport({ report }: MonthlyReportProps) {
  const { t } = useTranslation();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* ── Overview section — elevated card ── */}
      <div className="elevated-card">
        <h3 style={{ marginBottom: 20 }}>
          {report.month} {t("report.title")}
        </h3>
        <div
          style={{
            display: "flex",
            gap: 48,
            alignItems: "baseline",
            marginBottom: 20,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 12,
                color: "var(--text-tertiary)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                marginBottom: 4,
              }}
            >
              {t("report.income")}
            </div>
            <div
              className="num-display"
              style={{ fontSize: 24, fontWeight: 700, color: "var(--color-success)" }}
            >
              ¥{report.total_income.toLocaleString()}
            </div>
          </div>
          <div>
            <div
              style={{
                fontSize: 12,
                color: "var(--text-tertiary)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                marginBottom: 4,
              }}
            >
              {t("report.expense")}
            </div>
            <div
              className="num-display"
              style={{ fontSize: 24, fontWeight: 700, color: "var(--text-primary)" }}
            >
              ¥{report.total_expense.toLocaleString()}
            </div>
          </div>
          <div>
            <div
              style={{
                fontSize: 12,
                color: "var(--text-tertiary)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                marginBottom: 4,
              }}
            >
              {t("report.saving")}
            </div>
            <div
              className="num-display"
              style={{
                fontSize: 24,
                fontWeight: 700,
                color:
                  report.net_saving >= 0
                    ? "var(--color-success)"
                    : "var(--color-danger)",
              }}
            >
              ¥{report.net_saving.toLocaleString()}
            </div>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            paddingTop: 16,
            borderTop: "1px solid var(--border-subtle)",
          }}
        >
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            {t("report.rate")}
          </span>
          <span
            className="num-display"
            style={{ fontSize: 14, fontWeight: 600, color: "var(--color-primary)" }}
          >
            {report.saving_rate}%
          </span>
          <Badge variant={gradeBadge[report.saving_grade] || "default"}>
            {report.saving_grade}
          </Badge>
        </div>
      </div>

      {/* ── Anomalies — left accent ── */}
      {report.anomalies.length > 0 && (
        <div
          className="elevated-card"
          style={{
            borderLeft: "3px solid var(--color-warning)",
          }}
        >
          <h4
            style={{
              color: "var(--color-warning)",
              marginBottom: 12,
            }}
          >
            ⚠️ {t("report.anomalies")}
          </h4>
          <ul
            style={{
              listStyle: "none",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {report.anomalies.map((a, i) => (
              <li
                key={i}
                style={{
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                }}
              >
                <span style={{ color: "var(--color-warning)", flexShrink: 0 }}>
                  •
                </span>
                {a}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Advice — left accent ── */}
      {report.advice.length > 0 && (
        <div
          className="elevated-card"
          style={{
            borderLeft: "3px solid var(--color-primary)",
          }}
        >
          <h4
            style={{
              color: "var(--color-primary)",
              marginBottom: 12,
            }}
          >
            💡 {t("report.financialAdvice")}
          </h4>
          <ul
            style={{
              listStyle: "none",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {report.advice.map((a, i) => (
              <li
                key={i}
                style={{
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                }}
              >
                <span style={{ color: "var(--color-primary)", flexShrink: 0 }}>
                  •
                </span>
                {a}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Budget execution table — elevated card ── */}
      {report.budgets.length > 0 && (
        <div className="elevated-card">
          <h4 style={{ marginBottom: 16 }}>{t("report.budget")}</h4>

          {/* Table header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "8px 0",
              fontSize: 11,
              color: "var(--text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              borderBottom: "1px solid var(--border-default)",
            }}
          >
            <span style={{ width: 80 }}>{t("budget.category")}</span>
            <span style={{ width: 96, textAlign: "right" }}>
              {t("budget.monthly")}
            </span>
            <span style={{ width: 96, textAlign: "right" }}>
              {t("report.expense")}
            </span>
            <span style={{ width: 96, textAlign: "right" }}>
              {t("budget.remaining")}
            </span>
            <span style={{ flex: 1, textAlign: "right" }}>
              {t("dashboard.savingRate")}
            </span>
          </div>

          {/* Rows */}
          {report.budgets.map((b, i) => (
            <div
              key={i}
              className="table-row"
              style={{ padding: "12px 0" }}
            >
              <span
                style={{ width: 80, fontSize: 13, color: "var(--text-primary)" }}
              >
                {b.category}
              </span>
              <span
                className="num-display"
                style={{
                  width: 96,
                  textAlign: "right",
                  fontSize: 13,
                  color: "var(--text-secondary)",
                }}
              >
                ¥{b.budget.toLocaleString()}
              </span>
              <span
                className="num-display"
                style={{
                  width: 96,
                  textAlign: "right",
                  fontSize: 13,
                  color: "var(--text-primary)",
                }}
              >
                ¥{b.spent.toLocaleString()}
              </span>
              <span
                className="num-display"
                style={{
                  width: 96,
                  textAlign: "right",
                  fontSize: 13,
                  color:
                    b.remaining >= 0
                      ? "var(--color-success)"
                      : "var(--color-danger)",
                }}
              >
                ¥{b.remaining.toLocaleString()}
              </span>
              <span
                style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}
              >
                <BudgetProgress usagePct={b.usage_pct} status={b.status} />
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
