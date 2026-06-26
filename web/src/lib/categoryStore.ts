/**
 * Local category store using localStorage.
 * Merges backend categories with user-customized local overrides.
 */

const STORAGE_KEY = "smart-ledger-categories";
const LEGACY_KEY = "smart_ledger_categories";

export const DEFAULT_CATEGORY_NAMES = [
  "餐饮", "交通", "购物", "娱乐", "住房", "医疗",
  "教育", "通讯", "服饰", "礼物", "其他",
];

export interface CategoryItem {
  id: number;
  name: string;
  parent_id: number | null;
  color: string;
  icon: string;
  keywords: string[];
}

/** Migrate legacy string-array category storage into CategoryItem format. */
export function migrateLegacyCategoryNames(): void {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return;
    const names: unknown = JSON.parse(raw);
    if (!Array.isArray(names)) {
      localStorage.removeItem(LEGACY_KEY);
      return;
    }
    const local = getLocalCategoriesRaw();
    const existing = new Set(local.map((c) => c.name));
    let changed = false;
    for (const name of names) {
      if (typeof name !== "string") continue;
      const trimmed = name.trim();
      if (!trimmed || existing.has(trimmed)) continue;
      local.push({
        id: nextLocalIdFrom(local),
        name: trimmed,
        parent_id: null,
        color: CHART_COLORS[local.length % CHART_COLORS.length],
        icon: "",
        keywords: [],
      });
      existing.add(trimmed);
      changed = true;
    }
    if (changed) saveLocalCategories(local);
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    localStorage.removeItem(LEGACY_KEY);
  }
}

function getLocalCategoriesRaw(): CategoryItem[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function nextLocalIdFrom(local: CategoryItem[]): number {
  const minId = local.reduce((m, c) => Math.min(m, c.id), 0);
  return minId < 0 ? minId - 1 : -1;
}

/** Read user-customized categories from localStorage. */
export function getLocalCategories(): CategoryItem[] {
  migrateLegacyCategoryNames();
  return getLocalCategoriesRaw();
}

/** Add a user-defined category name to local storage. */
export function addLocalCategoryName(name: string): void {
  migrateLegacyCategoryNames();
  const trimmed = name.trim();
  if (!trimmed) return;
  const local = getLocalCategoriesRaw();
  if (local.some((c) => c.name === trimmed)) return;
  local.push({
    id: nextLocalIdFrom(local),
    name: trimmed,
    parent_id: null,
    color: CHART_COLORS[local.length % CHART_COLORS.length],
    icon: "",
    keywords: [],
  });
  saveLocalCategories(local);
}

/** Remove a user-defined category name from local storage. */
export function removeLocalCategoryName(name: string): void {
  migrateLegacyCategoryNames();
  saveLocalCategories(getLocalCategoriesRaw().filter((c) => c.name !== name));
}

/** Build a sorted unique category name list for transaction forms. */
export function buildCategoryNameList(items: CategoryItem[]): string[] {
  migrateLegacyCategoryNames();
  const fromItems = items.map((c) => c.name);
  const merged = [...new Set([...DEFAULT_CATEGORY_NAMES, ...fromItems])];
  return merged.sort((a, b) => a.localeCompare(b, "zh-CN"));
}

/** Save user-customized categories to localStorage. */
export function saveLocalCategories(categories: CategoryItem[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(categories));
}

/**
 * Merge backend categories with local overrides.
 * Local entries take priority for color/icon fields.
 */
export function mergeCategories(
  backend: CategoryItem[],
  local: CategoryItem[]
): CategoryItem[] {
  const localMap = new Map(local.map((c) => [c.id, c]));

  const merged = backend.map((b) => {
    const override = localMap.get(b.id);
    if (override) {
      return {
        ...b,
        color: override.color || b.color,
        icon: override.icon || b.icon,
        name: override.name || b.name,
      };
    }
    return b;
  });

  // Append purely local categories (id < 0 indicates local-only)
  const backendIds = new Set(backend.map((b) => b.id));
  for (const lc of local) {
    if (!backendIds.has(lc.id)) {
      merged.push(lc);
    }
  }

  return merged;
}

/** Generate a unique negative ID for local-only categories. */
export function nextLocalId(): number {
  return nextLocalIdFrom(getLocalCategoriesRaw());
}

/** Default color palette for categories — warm, accessible tones. */
export const CHART_COLORS = [
  "#0891b2",  // vibrant teal
  "#ea580c",  // vivid orange
  "#16a34a",  // emerald green
  "#7c3aed",  // vivid purple
  "#eab308",  // golden yellow
  "#dc2626",  // bright red
  "#2563eb",  // vivid blue
  "#d946ef",  // fuchsia
  "#0d9488",  // teal
  "#ca8a04",  // dark yellow
];
