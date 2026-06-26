/**
 * FeeSettingsModal — modal for configuring trading fee estimation settings.
 * Includes commission rate, min commission (免五/不免五), and fee preview.
 */

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { fetchFeeSettings, updateFeeSettings, type FeeSettings } from "../../lib/api";
import { useTranslation } from "../../i18n";

interface FeeSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export function FeeSettingsModal({ open, onClose }: FeeSettingsModalProps) {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<FeeSettings | null>(null);
  const [commissionRate, setCommissionRate] = useState("0.025");
  const [minCommission, setMinCommission] = useState("5");
  const [waiveMin, setWaiveMin] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      fetchFeeSettings().then((s) => {
        setSettings(s);
        // Convert from decimal (0.00025) to percentage (0.025)
        setCommissionRate((s.commission_rate * 100).toFixed(3));
        setMinCommission(s.min_commission.toString());
        setWaiveMin(!!s.waive_min_commission);
      });
    }
  }, [open]);

  const handleSave = async () => {
    setSaving(true);
    try {
      let minComm = parseFloat(minCommission);
      // Enforce minimum 5 yuan when 不免五
      if (!waiveMin && minComm < 5) {
        minComm = 5;
        setMinCommission("5");
      }
      await updateFeeSettings({
        commission_rate: parseFloat(commissionRate) / 100,
        min_commission: minComm,
        waive_min_commission: waiveMin,
      });
      onClose();
    } catch {
      // silently fail
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  // Preview: sell 10000 yuan
  const previewAmount = 10000;
  const rate = parseFloat(commissionRate) / 100;
  let previewCommission = previewAmount * rate;
  if (!waiveMin && previewCommission < parseFloat(minCommission) && previewCommission > 0) {
    previewCommission = parseFloat(minCommission);
  }
  const previewStampDuty = previewAmount * 0.0005;
  const previewTransferFee = previewAmount * 0.00001;
  const previewTotal = previewCommission + previewStampDuty + previewTransferFee;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0, 0, 0, 0.4)",
        backdropFilter: "blur(4px)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--bg-surface, #ffffff)",
          borderRadius: 16,
          width: "90%",
          maxWidth: 420,
          maxHeight: "85vh",
          overflow: "auto",
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.15)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid var(--border-light, #f5f5f4)",
          }}
        >
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
            {t("stocks.feeSettings.title")}
          </h3>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: 4,
              borderRadius: 6,
              display: "flex",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: "16px 20px" }}>
          {/* Commission rate */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>{t("stocks.feeSettings.commissionRate")}</label>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <input
                type="number"
                step="0.001"
                value={commissionRate}
                onChange={(e) => setCommissionRate(e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
              />
              <span style={{ fontSize: 14, color: "var(--text-secondary)" }}>%</span>
            </div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>
              {t("stocks.feeSettings.commissionHint")}
            </div>
          </div>

          {/* Min commission toggle */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>{t("stocks.feeSettings.minCommission")}</label>
            <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
              <label style={radioLabel}>
                <input
                  type="radio"
                  checked={!waiveMin}
                  onChange={() => setWaiveMin(false)}
                  style={{ marginRight: 6 }}
                />
                <span style={{ color: waiveMin ? "var(--text-secondary)" : "var(--color-danger, #dc2626)", fontWeight: waiveMin ? 400 : 600 }}>
                  {t("stocks.feeSettings.notWaived")}
                </span>
              </label>
              <label style={radioLabel}>
                <input
                  type="radio"
                  checked={waiveMin}
                  onChange={() => setWaiveMin(true)}
                  style={{ marginRight: 6 }}
                />
                <span style={{ color: waiveMin ? "var(--color-success, #16a34a)" : "var(--text-secondary)", fontWeight: waiveMin ? 600 : 400 }}>
                  {t("stocks.feeSettings.waived")}
                </span>
              </label>
            </div>
            {!waiveMin && (
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 8 }}>
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  {t("stocks.feeSettings.minAmount")}:
                </span>
                <input
                  type="number"
                  min="5"
                  step="0.5"
                  value={minCommission}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (val >= 5 || e.target.value === "") {
                      setMinCommission(e.target.value);
                    }
                  }}
                  style={{ ...inputStyle, width: 80, textAlign: "center" }}
                />
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>元</span>
                <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>(最低5元)</span>
              </div>
            )}
          </div>

          {/* Fee structure info */}
          <div
            style={{
              padding: 12,
              background: "var(--bg-secondary, #f8fafc)",
              borderRadius: 8,
              fontSize: 11,
              color: "var(--text-tertiary)",
              lineHeight: 1.6,
              marginBottom: 16,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 4, color: "var(--text-secondary)" }}>
              {t("stocks.feeStructure")}
            </div>
            <div>• {t("stocks.feeStructure.commission")}</div>
            <div>• {t("stocks.feeStructure.stampDuty")}</div>
            <div>• {t("stocks.feeStructure.transferFee")}</div>
          </div>

          {/* Preview */}
          <div
            style={{
              padding: 12,
              background: "var(--bg-secondary, #f8fafc)",
              borderRadius: 8,
              fontSize: 12,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 6, color: "var(--text-secondary)" }}>
              {t("stocks.feeSettings.preview")} (卖出 ¥10,000)
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
              <span style={{ color: "var(--text-tertiary)" }}>{t("stocks.feeSettings.commission")}</span>
              <span style={{ fontFamily: "var(--font-mono)" }}>¥{previewCommission.toFixed(3)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
              <span style={{ color: "var(--text-tertiary)" }}>{t("stocks.feeStructure.stampDuty")}</span>
              <span style={{ fontFamily: "var(--font-mono)" }}>¥{previewStampDuty.toFixed(3)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
              <span style={{ color: "var(--text-tertiary)" }}>{t("stocks.feeStructure.transferFee")}</span>
              <span style={{ fontFamily: "var(--font-mono)" }}>¥{previewTransferFee.toFixed(3)}</span>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                borderTop: "1px solid var(--border-light, #e2e8f0)",
                paddingTop: 6,
                marginTop: 6,
                fontWeight: 600,
              }}
            >
              <span>{t("stocks.feeSettings.totalFee")}</span>
              <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-danger, #dc2626)" }}>
                ¥{previewTotal.toFixed(3)}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            borderTop: "1px solid var(--border-light, #f5f5f4)",
          }}
        >
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: "14px",
              border: "none",
              background: "none",
              fontSize: 14,
              color: "var(--text-secondary)",
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              flex: 1,
              padding: "14px",
              border: "none",
              background: "none",
              fontSize: 14,
              color: "var(--color-primary, #0891b2)",
              cursor: saving ? "not-allowed" : "pointer",
              fontWeight: 600,
              opacity: saving ? 0.5 : 1,
              borderLeft: "1px solid var(--border-light, #f5f5f4)",
            }}
          >
            {saving ? "..." : t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "var(--text-secondary)",
  display: "block",
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  padding: "8px 12px",
  fontSize: 14,
  fontFamily: "var(--font-mono)",
  border: "1px solid var(--border-default, #d6d3d1)",
  borderRadius: 8,
  background: "var(--bg-surface, #ffffff)",
  color: "var(--text-primary)",
  outline: "none",
  boxSizing: "border-box",
};

const radioLabel: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  cursor: "pointer",
  fontSize: 13,
};
