/**
 * Assets — Asset & Liability management page.
 * Provides CRUD for personal assets and liabilities, with net worth summary.
 */

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "../i18n";
import {
  fetchAssets,
  addAsset,
  updateAsset,
  deleteAsset,
  fetchLiabilities,
  addLiability,
  updateLiability,
  deleteLiability,
  fetchNetWorth,
} from "../lib/api";
import type { Asset, Liability, NetWorth } from "../lib/types";

// ── Asset category options ─────────────────────────────────────

const ASSET_CATEGORIES = ["现金", "股票", "基金", "房产", "其他"];
const ASSET_CATEGORY_KEYS: Record<string, string> = {
  "现金": "assets.cash",
  "股票": "assets.stocks",
  "基金": "assets.funds",
  "房产": "assets.property",
  "其他": "assets.other",
};

const LIABILITY_CATEGORIES = ["房贷", "消费贷", "信用卡", "其他"];
const LIABILITY_CATEGORY_KEYS: Record<string, string> = {
  "房贷": "assets.mortgage",
  "消费贷": "assets.consumerLoan",
  "信用卡": "assets.creditCard",
  "其他": "assets.other",
};

// ── Helpers ────────────────────────────────────────────────────

function fmt(n: number): string {
  if (Math.abs(n) >= 10000) return `¥${(n / 10000).toFixed(2)}万`;
  return `¥${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Main Component ─────────────────────────────────────────────

export default function Assets() {
  const { t } = useTranslation();

  const [assets, setAssets] = useState<Asset[]>([]);
  const [liabilities, setLiabilities] = useState<Liability[]>([]);
  const [netWorth, setNetWorth] = useState<NetWorth>({ total_assets: 0, total_liabilities: 0, net_worth: 0 });
  const [loading, setLoading] = useState(true);

  // Asset form state
  const [assetName, setAssetName] = useState("");
  const [assetCategory, setAssetCategory] = useState("现金");
  const [assetAmount, setAssetAmount] = useState("");
  const [editingAssetId, setEditingAssetId] = useState<number | null>(null);

  // Liability form state
  const [liabilityName, setLiabilityName] = useState("");
  const [liabilityCategory, setLiabilityCategory] = useState("房贷");
  const [liabilityAmount, setLiabilityAmount] = useState("");
  const [liabilityRate, setLiabilityRate] = useState("");
  const [editingLiabilityId, setEditingLiabilityId] = useState<number | null>(null);

  // ── Data loading ─────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [a, l, nw] = await Promise.all([fetchAssets(), fetchLiabilities(), fetchNetWorth()]);
      setAssets(a);
      setLiabilities(l);
      setNetWorth(nw);
    } catch (err) {
      console.error("Failed to load assets/liabilities:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Asset CRUD ───────────────────────────────────────────────

  const handleAssetSubmit = async () => {
    if (!assetName.trim()) return;
    try {
      if (editingAssetId !== null) {
        await updateAsset(editingAssetId, {
          name: assetName.trim(),
          category: assetCategory,
          amount: parseFloat(assetAmount) || 0,
        });
      } else {
        await addAsset(assetName.trim(), assetCategory, parseFloat(assetAmount) || 0);
      }
      resetAssetForm();
      loadData();
    } catch (err) {
      console.error("Asset save failed:", err);
    }
  };

  const handleAssetEdit = (asset: Asset) => {
    setEditingAssetId(asset.id);
    setAssetName(asset.name);
    setAssetCategory(asset.category);
    setAssetAmount(String(asset.amount));
  };

  const handleAssetDelete = async (id: number) => {
    if (!window.confirm(t("assets.confirmDelete"))) return;
    try {
      await deleteAsset(id);
      loadData();
    } catch (err) {
      console.error("Asset delete failed:", err);
    }
  };

  const resetAssetForm = () => {
    setEditingAssetId(null);
    setAssetName("");
    setAssetCategory("现金");
    setAssetAmount("");
  };

  // ── Liability CRUD ───────────────────────────────────────────

  const handleLiabilitySubmit = async () => {
    if (!liabilityName.trim()) return;
    try {
      if (editingLiabilityId !== null) {
        await updateLiability(editingLiabilityId, {
          name: liabilityName.trim(),
          category: liabilityCategory,
          amount: parseFloat(liabilityAmount) || 0,
          interest_rate: parseFloat(liabilityRate) || 0,
        });
      } else {
        await addLiability(
          liabilityName.trim(),
          liabilityCategory,
          parseFloat(liabilityAmount) || 0,
          parseFloat(liabilityRate) || 0
        );
      }
      resetLiabilityForm();
      loadData();
    } catch (err) {
      console.error("Liability save failed:", err);
    }
  };

  const handleLiabilityEdit = (liability: Liability) => {
    setEditingLiabilityId(liability.id);
    setLiabilityName(liability.name);
    setLiabilityCategory(liability.category);
    setLiabilityAmount(String(liability.amount));
    setLiabilityRate(String(liability.interest_rate));
  };

  const handleLiabilityDelete = async (id: number) => {
    if (!window.confirm(t("assets.confirmDelete"))) return;
    try {
      await deleteLiability(id);
      loadData();
    } catch (err) {
      console.error("Liability delete failed:", err);
    }
  };

  const resetLiabilityForm = () => {
    setEditingLiabilityId(null);
    setLiabilityName("");
    setLiabilityCategory("房贷");
    setLiabilityAmount("");
    setLiabilityRate("");
  };

  // ── Render ───────────────────────────────────────────────────

  return (
    <div className="page" style={{ display: "flex", flexDirection: "column", gap: 24, padding: "28px 0" }}>
      {/* Page title */}
      <div style={{ padding: "0 28px" }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)" }}>
          {t("assets.title")}
        </h2>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>
          {t("assets.subtitle")}
        </p>
      </div>

      {/* Net Worth Summary Card */}
      <div style={{ padding: "0 28px" }}>
        <div
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 12,
            padding: "28px 32px",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 32,
              textAlign: "center",
            }}
          >
            <div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
                {t("assets.totalAssets")}
              </div>
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 700,
                  fontFamily: "var(--font-mono)",
                  color: "var(--color-success)",
                }}
              >
                {fmt(netWorth.total_assets)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
                {t("assets.totalLiabilities")}
              </div>
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 700,
                  fontFamily: "var(--font-mono)",
                  color: "var(--color-danger)",
                }}
              >
                {fmt(netWorth.total_liabilities)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
                {t("assets.netWorth")}
              </div>
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 700,
                  fontFamily: "var(--font-mono)",
                  color: netWorth.net_worth >= 0 ? "var(--color-primary)" : "var(--color-danger)",
                }}
              >
                {fmt(netWorth.net_worth)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content: Assets & Liabilities side by side */}
      <div style={{ padding: "0 28px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        {/* ── Assets Section ────────────────────────────────── */}
        <div>
          <div
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-subtle)" }}>
              <h4 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>
                {t("assets.assetsList")}
              </h4>
            </div>

            {/* Add/Edit Form */}
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-page)" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <input
                  className="input"
                  style={{ padding: "10px 14px", fontSize: 13 }}
                  placeholder={t("assets.assetName")}
                  value={assetName}
                  onChange={(e) => setAssetName(e.target.value)}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <select
                    className="input"
                    style={{ flex: 1, padding: "10px 14px", fontSize: 13 }}
                    value={assetCategory}
                    onChange={(e) => setAssetCategory(e.target.value)}
                  >
                    {ASSET_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>{t(ASSET_CATEGORY_KEYS[cat])}</option>
                    ))}
                  </select>
                  <input
                    className="input"
                    style={{ flex: 1, padding: "10px 14px", fontSize: 13 }}
                    type="number"
                    placeholder={t("assets.amount")}
                    value={assetAmount}
                    onChange={(e) => setAssetAmount(e.target.value)}
                  />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="btn btn-primary"
                    style={{ flex: 1, padding: "8px 16px", fontSize: 13 }}
                    onClick={handleAssetSubmit}
                    disabled={!assetName.trim()}
                  >
                    {editingAssetId !== null ? t("common.save") : t("assets.addAsset")}
                  </button>
                  {editingAssetId !== null && (
                    <button
                      className="btn btn-ghost"
                      style={{ padding: "8px 16px", fontSize: 13 }}
                      onClick={resetAssetForm}
                    >
                      {t("common.cancel")}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Asset List */}
            <div style={{ padding: "8px 0" }}>
              {loading ? (
                <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
                  {t("common.loading")}
                </div>
              ) : assets.length === 0 ? (
                <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
                  {t("assets.noAssets")}
                </div>
              ) : (
                assets.map((asset) => (
                  <div
                    key={asset.id}
                    className="table-row"
                    style={{ padding: "12px 20px" }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>
                        {asset.name}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>
                        {t(ASSET_CATEGORY_KEYS[asset.category] || "assets.other")}
                      </div>
                    </div>
                    <div
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 15,
                        fontWeight: 600,
                        color: "var(--color-success)",
                        marginRight: 12,
                      }}
                    >
                      {fmt(asset.amount)}
                    </div>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button
                        className="btn btn-ghost delete-btn"
                        style={{ padding: "4px 8px", fontSize: 12 }}
                        onClick={() => handleAssetEdit(asset)}
                      >
                        {t("common.edit")}
                      </button>
                      <button
                        className="btn btn-ghost delete-btn"
                        style={{ padding: "4px 8px", fontSize: 12 }}
                        onClick={() => handleAssetDelete(asset.id)}
                      >
                        {t("common.delete")}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ── Liabilities Section ──────────────────────────── */}
        <div>
          <div
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-subtle)" }}>
              <h4 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>
                {t("assets.liabilitiesList")}
              </h4>
            </div>

            {/* Add/Edit Form */}
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-page)" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <input
                  className="input"
                  style={{ padding: "10px 14px", fontSize: 13 }}
                  placeholder={t("assets.liabilityName")}
                  value={liabilityName}
                  onChange={(e) => setLiabilityName(e.target.value)}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <select
                    className="input"
                    style={{ flex: 1, padding: "10px 14px", fontSize: 13 }}
                    value={liabilityCategory}
                    onChange={(e) => setLiabilityCategory(e.target.value)}
                  >
                    {LIABILITY_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>{t(LIABILITY_CATEGORY_KEYS[cat])}</option>
                    ))}
                  </select>
                  <input
                    className="input"
                    style={{ flex: 1, padding: "10px 14px", fontSize: 13 }}
                    type="number"
                    placeholder={t("assets.amount")}
                    value={liabilityAmount}
                    onChange={(e) => setLiabilityAmount(e.target.value)}
                  />
                </div>
                <input
                  className="input"
                  style={{ padding: "10px 14px", fontSize: 13 }}
                  type="number"
                  step="0.1"
                  placeholder={t("assets.interestRate")}
                  value={liabilityRate}
                  onChange={(e) => setLiabilityRate(e.target.value)}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="btn btn-primary"
                    style={{ flex: 1, padding: "8px 16px", fontSize: 13 }}
                    onClick={handleLiabilitySubmit}
                    disabled={!liabilityName.trim()}
                  >
                    {editingLiabilityId !== null ? t("common.save") : t("assets.addLiability")}
                  </button>
                  {editingLiabilityId !== null && (
                    <button
                      className="btn btn-ghost"
                      style={{ padding: "8px 16px", fontSize: 13 }}
                      onClick={resetLiabilityForm}
                    >
                      {t("common.cancel")}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Liability List */}
            <div style={{ padding: "8px 0" }}>
              {loading ? (
                <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
                  {t("common.loading")}
                </div>
              ) : liabilities.length === 0 ? (
                <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
                  {t("assets.noLiabilities")}
                </div>
              ) : (
                liabilities.map((liability) => (
                  <div
                    key={liability.id}
                    className="table-row"
                    style={{ padding: "12px 20px" }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>
                        {liability.name}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>
                        {t(LIABILITY_CATEGORY_KEYS[liability.category] || "assets.other")}
                        {liability.interest_rate > 0 && (
                          <span style={{ marginLeft: 8, color: "var(--color-warning)" }}>
                            {liability.interest_rate}%
                          </span>
                        )}
                      </div>
                    </div>
                    <div
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 15,
                        fontWeight: 600,
                        color: "var(--color-danger)",
                        marginRight: 12,
                      }}
                    >
                      {fmt(liability.amount)}
                    </div>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button
                        className="btn btn-ghost delete-btn"
                        style={{ padding: "4px 8px", fontSize: 12 }}
                        onClick={() => handleLiabilityEdit(liability)}
                      >
                        {t("common.edit")}
                      </button>
                      <button
                        className="btn btn-ghost delete-btn"
                        style={{ padding: "4px 8px", fontSize: 12 }}
                        onClick={() => handleLiabilityDelete(liability.id)}
                      >
                        {t("common.delete")}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
