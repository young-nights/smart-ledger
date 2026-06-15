/**
 * Local category store using localStorage.
 * Merges backend categories with user-customized local overrides.
 */

const STORAGE_KEY = "smart-ledger-categories";

export interface CategoryItem {
  id: number;
  name: string;
  parent_id: number | null;
  color: string;
  icon: string;
  keywords: string[];
}

/** Read user-customized categories from localStorage. */
export function getLocalCategories(): CategoryItem[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
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
  const local = getLocalCategories();
  const minId = local.reduce((m, c) => Math.min(m, c.id), 0);
  return minId < 0 ? minId - 1 : -1;
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
