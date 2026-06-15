/**
 * Category Manager panel — view, add, edit, delete categories.
 * No card wrapper. Flat list with section dividers.
 * Supports i18n.
 */

import { useState, useMemo } from "react";
import type { CategoryItem } from "../../lib/categoryStore";
import { CHART_COLORS, nextLocalId } from "../../lib/categoryStore";
import { useTranslation } from "../../i18n";

interface CategoryManagerProps {
  categories: CategoryItem[];
  onUpdate: (categories: CategoryItem[]) => void;
}

const EMOJI_OPTIONS = [
  "🍔", "🛒", "🚗", "🏠", "💊", "📚", "🎮", "✈️",
  "💰", "🎁", "☕", "🍕", "🚌", "💡", "📱", "🎵",
  "🏥", "👔", "🧹", "💼", "🎬", "🏋️", "🐾", "🌐",
];

export function CategoryManager({ categories, onUpdate }: CategoryManagerProps) {
  const { t } = useTranslation();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [formName, setFormName] = useState("");
  const [formColor, setFormColor] = useState(CHART_COLORS[0]);
  const [formIcon, setFormIcon] = useState("");
  const [formParentId, setFormParentId] = useState<number | null>(null);

  const parentCats = useMemo(
    () => categories.filter((c) => c.parent_id === null),
    [categories]
  );
  const childrenOf = useMemo(() => {
    const map = new Map<number, CategoryItem[]>();
    for (const c of categories) {
      if (c.parent_id !== null) {
        if (!map.has(c.parent_id)) map.set(c.parent_id, []);
        map.get(c.parent_id)!.push(c);
      }
    }
    return map;
  }, [categories]);

  function resetForm() {
    setFormName("");
    setFormColor(CHART_COLORS[0]);
    setFormIcon("");
    setFormParentId(null);
    setEditingId(null);
    setShowAdd(false);
  }

  function handleEdit(cat: CategoryItem) {
    setEditingId(cat.id);
    setFormName(cat.name);
    setFormColor(cat.color || CHART_COLORS[0]);
    setFormIcon(cat.icon || "");
    setFormParentId(cat.parent_id);
    setShowAdd(false);
  }

  function handleSave() {
    if (!formName.trim()) return;
    let updated: CategoryItem[];
    if (editingId !== null) {
      updated = categories.map((c) =>
        c.id === editingId
          ? { ...c, name: formName.trim(), color: formColor, icon: formIcon }
          : c
      );
    } else {
      const newCat: CategoryItem = {
        id: nextLocalId(),
        name: formName.trim(),
        parent_id: formParentId,
        color: formColor,
        icon: formIcon,
        keywords: [],
      };
      updated = [...categories, newCat];
    }
    onUpdate(updated);
    resetForm();
  }

  function handleDelete(id: number) {
    const idsToRemove = new Set([id]);
    for (const c of categories) {
      if (c.parent_id !== null && idsToRemove.has(c.parent_id)) {
        idsToRemove.add(c.id);
      }
    }
    onUpdate(categories.filter((c) => !idsToRemove.has(c.id)));
    if (editingId === id) resetForm();
  }

  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <h4>{t("budget.category")}</h4>
        <button
          className="btn btn-primary"
          style={{ fontSize: 12, padding: "5px 12px" }}
          onClick={() => { resetForm(); setShowAdd(true); }}
        >
          + {t("budget.add")}
        </button>
      </div>

      {/* Category list */}
      <div>
        {parentCats.map((cat) => (
          <div key={cat.id}>
            <div
              className="table-row"
              style={{
                padding: "12px 0",
                gap: 10,
              }}
            >
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 3,
                  background: cat.color || "var(--text-tertiary)",
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 16, flexShrink: 0 }}>
                {cat.icon || "📁"}
              </span>
              <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>
                {cat.name}
              </span>
              <button
                className="btn btn-ghost"
                style={{ fontSize: 11, padding: "3px 8px" }}
                onClick={() => handleEdit(cat)}
              >
                {t("common.edit")}
              </button>
              <button
                className="btn btn-ghost"
                style={{ fontSize: 11, padding: "3px 8px", color: "var(--color-danger)" }}
                onClick={() => handleDelete(cat.id)}
              >
                {t("common.delete")}
              </button>
            </div>

            {(childrenOf.get(cat.id) || []).map((child) => (
              <div
                key={child.id}
                className="table-row"
                style={{
                  padding: "8px 0 8px 32px",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: child.color || "var(--text-tertiary)",
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 14, flexShrink: 0 }}>
                  {child.icon || "📄"}
                </span>
                <span style={{ fontSize: 12, flex: 1, color: "var(--text-secondary)" }}>
                  {child.name}
                </span>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 11, padding: "2px 6px" }}
                  onClick={() => handleEdit(child)}
                >
                  {t("common.edit")}
                </button>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 11, padding: "2px 6px", color: "var(--color-danger)" }}
                  onClick={() => handleDelete(child.id)}
                >
                  {t("common.delete")}
                </button>
              </div>
            ))}
          </div>
        ))}

        {parentCats.length === 0 && (
          <p style={{ fontSize: 13, color: "var(--text-tertiary)", padding: "24px 0" }}>
            {t("common.empty")}
          </p>
        )}
      </div>

      {/* Add/Edit form */}
      {(showAdd || editingId !== null) && (
        <div
          style={{
            paddingTop: 16,
            marginTop: 16,
            borderTop: "1px solid var(--border-subtle)",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
            {editingId !== null ? t("common.edit") : t("budget.add")}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input
              className="input"
              placeholder={t("budget.category")}
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
            />
            {editingId === null && (
              <select
                className="input"
                value={formParentId ?? ""}
                onChange={(e) =>
                  setFormParentId(e.target.value ? Number(e.target.value) : null)
                }
              >
                <option value="">{t("budget.category")}</option>
                {parentCats.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.icon} {p.name}
                  </option>
                ))}
              </select>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                {t("savings.color")}:
              </span>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {CHART_COLORS.map((c) => (
                  <div
                    key={c}
                    onClick={() => setFormColor(c)}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 4,
                      background: c,
                      cursor: "pointer",
                      border:
                        formColor === c
                          ? "2px solid var(--text-primary)"
                          : "2px solid transparent",
                      transition: "border-color 0.1s",
                    }}
                  />
                ))}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Icon:</span>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {EMOJI_OPTIONS.map((e) => (
                  <div
                    key={e}
                    onClick={() => setFormIcon(e)}
                    style={{
                      width: 28,
                      height: 28,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: 4,
                      cursor: "pointer",
                      fontSize: 16,
                      background:
                        formIcon === e
                          ? "var(--color-primary-light)"
                          : "transparent",
                      border:
                        formIcon === e
                          ? "1px solid var(--color-primary)"
                          : "1px solid transparent",
                      transition: "all 0.1s",
                    }}
                  >
                    {e}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button className="btn btn-primary" onClick={handleSave}>
                {editingId !== null ? t("savings.update") : t("txn.add")}
              </button>
              <button className="btn btn-ghost" onClick={resetForm}>
                {t("common.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
