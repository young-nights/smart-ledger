/**
 * Report — editorial layout. Sections with left accents for alerts/advice.
 * No nested cards. Visual rhythm through spacing.
 */

import { MonthlyReport } from "../components/report/MonthlyReport";
import { useTranslation } from "../i18n";
import { useReport } from "../hooks/useLedger";

export default function Report() {
  const { t } = useTranslation();
  const { data: report, loading } = useReport();

  if (loading) {
    return (
      <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
        {t("common.loading")}
      </p>
    );
  }

  if (!report) {
    return (
      <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
        {t("report.noReport")}
      </p>
    );
  }

  return <MonthlyReport report={report} />;
}
