# Smart Ledger UI Redesign Spec

## Design Direction: Editorial Finance

**Tone**: Editorial/magazine meets utilitarian finance. Think: Bloomberg Terminal aesthetics crossed with a beautifully designed print magazine. Clean, information-dense, but with personality.

**Differentiation**: Not another card-based dashboard. Instead: a data-rich editorial layout with intentional typography, asymmetric compositions, and purposeful color. Every pixel earns its place.

---

## Typography System

**Primary**: DM Sans (geometric, clean, modern)
**Display**: Fraunces (serif, editorial feel for headlines)
**Mono**: JetBrains Mono (for numbers and data)

```css
--font-display: 'Fraunces', Georgia, serif;
--font-body: 'DM Sans', system-ui, sans-serif;
--font-mono: 'JetBrains Mono', monospace;

/* Modular Scale - Perfect Fourth (1.333) */
--text-xs: 0.75rem;    /* 12px */
--text-sm: 0.875rem;   /* 14px */
--text-base: 1rem;     /* 16px */
--text-lg: 1.25rem;    /* 20px */
--text-xl: 1.5rem;     /* 24px */
--text-2xl: 2rem;      /* 32px */
--text-3xl: 2.667rem;  /* 42.67px */
```

## Color System (OKLCH)

**Primary**: Deep teal (#0d7377) - trustworthy, financial
**Accent**: Warm coral (#e85d4f) - action, alerts
**Success**: Sage green (#4a7c59)
**Warning**: Amber (#d4a843)
**Danger**: Muted red (#c44536)

**Neutrals**: Warm-tinted grays (hue 60°)
```css
--neutral-50: oklch(97% 0.005 60);
--neutral-100: oklch(94% 0.008 60);
--neutral-200: oklch(88% 0.008 60);
--neutral-300: oklch(76% 0.008 60);
--neutral-400: oklch(64% 0.008 60);
--neutral-500: oklch(52% 0.008 60);
--neutral-600: oklch(40% 0.008 60);
--neutral-700: oklch(28% 0.008 60);
--neutral-800: oklch(18% 0.008 60);
--neutral-900: oklch(12% 0.008 60);
```

## Layout Principles

1. **No card nesting** - Use spacing and typography for hierarchy
2. **Asymmetric grids** - Not everything in equal columns
3. **Visual rhythm** - 4pt base, varied spacing
4. **Left-aligned text** - More designed than center-aligned
5. **Generous whitespace** - Let content breathe

## New Features

### 1. Savings Goals
- Visual progress rings
- Target amount, current progress, deadline
- Auto-calculate monthly needed

### 2. Spending Heatmap
- Calendar view (GitHub-style)
- Color intensity = spending amount
- Click day to see transactions

### 3. Quick Actions FAB
- Floating action button
- Expand on hover/click
- Quick add, scan receipt, voice input

### 4. Data Export
- CSV export for spreadsheets
- JSON export for developers
- Date range selection

### 5. Theme Toggle
- Light/Dark mode
- Proper OKLCH theming
- System preference detection

### 6. Recurring Detection
- Auto-detect recurring transactions
- Show upcoming recurring expenses
- Mark as recurring
