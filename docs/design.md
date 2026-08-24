# Git Forest — UI/UX Design System & Architecture Specification

**Version:** 0.4.0
**Status:** Design System Specification & Engineering Reference
**Target:** GTK / Desktop / Web-shell Alignment (Tauri + React)

---

## 1. Design Philosophy & Core Principles

Git Forest is built as a keyboard-first, high-density desktop control plane for managing parallel Git worktrees and AI coding agent sessions. Unlike consumer apps or modern AI "bento-box grid" layouts, Git Forest prioritizes information density, instant visual hierarchy, and precise developer tooling aesthetics (reminiscent of Sublime Merge, Zed, Linear, and Lazygit).

### Core Principles

- **Density over Decoration:** Maximize visible worktree telemetry (branch, commit ahead/behind, stash, agent PID) without relying on large decorative cards or wasted whitespace.
- **Keyboard-First Interaction:** Every action reachable via mouse must be accessible in ≤ 2 keypresses (`Super+W`, `Cmd+K`, `Enter`, `⌥A`).
- **Tri-Modal Navigation Structure:**
  - **Quick Launch Overlay:** A zero-mouse search modal for rapid switching.
  - **Cockpit View:** High-density grouped tree list with inline accordions and real-time process monitoring.
  - **Tray Daemon:** System top-bar status and background session launcher.
- **Contextual Isolation:** Highlighting running agent sessions (Codex, Claude Code, OpenCode) directly alongside the Git worktree branch context.

---

## 2. Design Tokens & Color System

Git Forest utilizes a tailored light/slate theme optimized for code readability, GTK/Linux desktop parity, and clean contrast boundaries.

### 2.1 CSS Custom Properties (`:root`)

```css
:root {
  /* Canvas & Layout Stages */
  --canvas-bg: #EEF3F8;         /* Main app stage background */
  --card-bg: #FFFFFF;           /* Container surface & row background */
  --card-border: #E0E7F0;       /* Surface border stroke */

  /* Navigation Hierarchy */
  --l1-rail-bg: #FFFFFF;        /* Primary icon navigation rail */
  --l1-icon-inactive: #91A0B2;  /* Inactive rail icon color */
  --l1-divider: #E0E7F0;        /* Rail border separator */
  --l2-panel-bg: #DCE5EF;       /* Secondary repository list background */
  --l2-text-active: #0F172A;    /* Primary text in sub-panels */
  --l2-text-muted: #475569;     /* Sub-label text in sub-panels */
  --l2-divider: #C8D5E3;        /* Sub-panel internal border divider */

  /* Branding & Accents */
  --brand-accent: #06B6D4;      /* Forest Cyan brand accent */

  /* Typography */
  --text-primary: #0F172A;      /* Slate-900 high contrast primary text */
  --text-secondary: #475569;    /* Slate-600 muted body text */

  /* Telemetry Badges */
  --badge-high-bg: #FFE4E6;     /* Rose-100: Dirty state / warnings */
  --badge-high-text: #E11D48;   /* Rose-600 */
  --badge-mod-bg: #FEF9C3;      /* Yellow-100: Stash / moderate warnings */
  --badge-mod-text: #CA8A04;    /* Yellow-700 */
  --badge-good-bg: #CFFAFE;     /* Cyan-100: Active agent / clean status */
  --badge-good-text: #0E7490;   /* Cyan-700 */
}
```

### 2.2 Typography Scale

The interface uses a strict dual-font strategy:

- **UI & Structural Labels:** Plus Jakarta Sans (400, 500, 600, 700)
- **Git Metadata, Paths, PIDs & Hotkey Badges:** JetBrains Mono (400, 500, 600)

| Token Name | Font Family | Size | Weight | Line Height | Usage |
| --- | --- | --- | --- | --- | --- |
| `text-display` | Plus Jakarta Sans | 16px | 700 | 1.2 | Main Section / Modal Titles |
| `text-heading` | Plus Jakarta Sans | 14px | 600 | 1.3 | Repo Group Headers / Inspector Headings |
| `text-body` | Plus Jakarta Sans | 12px | 500 | 1.4 | Standard UI labels, button text |
| `text-mono-code` | JetBrains Mono | 11px | 500 | 1.4 | Branch names, paths, hotkeys |
| `text-micro` | JetBrains Mono | 9px–10px | 600 | 1.2 | Badges, commit drift (2↑ 1↓), PIDs |

---

## 3. Layout & Visual Architecture

The application layout follows a 4-tier horizontal split stage:

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ TOP OPERATING SYSTEM BAR & TRAY INDICATOR (h-10 / 40px)                          │
├────┬────────────┬─────────────────────────────────────────────────┬──────────────┤
│ L1 │ L2 REPO    │ CENTRAL WORKSPACE: COCKPIT VIEW                 │ RIGHT        │
│RAIL│ PANEL      │                                                 │ INSPECTOR    │
│    │            │ ┌─────────────────────────────────────────────┐ │ PANEL        │
│    │ (w-56 /    │ │ Cockpit Control Bar & Filters               │ │              │
│(w- │  224px)    │ ├─────────────────────────────────────────────┤ │ (w-80 /      │
│ 14 │            │ │ 📦 EXOG App (4 worktrees)       [▼ Expand]  │ │  320px)      │
│ /  │ Collapsible│ │  ├── feat/risk-483     [Codex PID 48912]    │ │              │
│56px│            │ │  └── fix/report-export [clean]              │ │ Worktree     │
│    │            │ │ 📦 EXOG API (2 worktrees)                   │ │ Metadata,    │
│    │            │ │  └── refactor/db-schema [dirty ▲]           │ │ Telemetry &  │
│    │            │ └─────────────────────────────────────────────┘ │ Triggers     │
└────┴────────────┴─────────────────────────────────────────────────┴──────────────┘
```

### 3.1 Stage Descriptions

- **Top OS Bar (h-10):** Displays application identity, version badge (`v0.4.0`), quick view mode badge, and top-right System Tray trigger displaying real-time active worktree & background process count.
- **L1 Rail (w-14):** Fixed icon navigation rail for quick access to Cockpit, Sidebar Collapse Toggle, Quick Launch Modal Trigger, Agent Monitor, and Settings.
- **L2 Repositories Panel (w-56):** Collapsible sub-sidebar listing indexed local Git repositories with paths and linked status badges. Supports accordion collapse (◄).
- **Central Cockpit Stage (flex-1):** The primary worktree control plane.
  - **Header Toolbar:** Global Expand/Collapse All accordion toggle, live branch search filter input, and status category pills (All, Agents, Dirty).
  - **Grouped Worktree List:** Accordion groups per repository displaying branch hierarchy trees (`├──`, `└──`), status tags, process PIDs, commit drift, and direct editor triggers.
- **Right Inspector Panel (w-80):** Collapsible metadata inspector detailing branch root path, ahead/behind/stash telemetry, agent session attach actions, and safe deletion controls.

---

## 4. Key Component Specifications

### 4.1 Worktree Row Component

Worktree rows are designed as high-density list items:

- **Hierarchy Marker:** `├──` for child branches, `└──` for terminal branches in a repository block.
- **Branch Title:** Monospace bold primary text.
- **Inline Badges:**
  - `dirty`: `--badge-high-bg` / `--badge-high-text` (Rose)
  - `clean`: `--badge-good-bg` / `--badge-good-text` (Cyan)
  - **Agent Session:** `--badge-good-bg` pill with pulsing Cyan dot (`● Codex (PID 48912)`)
- **Right Telemetry & Actions:**
  - Drift pill: `2↑ 1↓`
  - Instant action buttons: Warp, Cursor

### 4.2 Accordion Collapse Controls

To manage large multi-repository workspaces without clutter:

- **Individual Repo Header Toggle:** Clicking a repository header (`📦 EXOG App`) toggles the visibility of its child worktree rows (`isCollapsed`).
- **Global Accordion Control:** Top bar button toggles all repositories simultaneously (`► Expand All` / `▼ Collapse All`).
- **Side Panel Collapsibility:** Left L2 panel and Right Inspector panel collapse to single-icon sidebars to maximize workspace area for wide screens.

### 4.3 Quick Launch Modal Overlay (Raycast Style)

Triggered via `Super + W` or `Cmd + K`:

- **Backdrop:** Translucent overlay (`bg-scrim backdrop-blur-sm`), which follows the theme.
- **Card:** `max-w-2xl` floating surface with immediate autofocus search input.
- **Sections:** Two labelled groups filtered by the one query — **Commands** first, then **Repositories & worktrees**. A group with no matches is not rendered at all.
- **Footer keyhints:** `↵ Run`, `Tab Actions`, `Esc Close`, plus a result count.

**Commands.** Built by `features/launcher/commands.ts` from a plain context object, so which entries exist and which are disabled is testable without a DOM. `App` supplies the context because it already owns the state the commands mutate; the overlay stays presentational and never knows what a command does.

Before anything is typed, the palette shows the first seven runnable commands — enough to browse, short enough to scan. Typing ranks commands on **title and keywords only**, deliberately not the subtitle: the subtitle holds the selected repository or worktree name, and matching it would rank `Remove worktree… feat/x` above `feat/x` itself for anyone searching a branch.

**Context without a submenu.** Commands that act on a selection carry it in the subtitle (`New worktree… · EXOG App`) and go disabled with a reason (`Select a repository first`) when nothing is selected. That is the flat-list answer to context, and it covers the common case.

**Disabled entries stay findable.** Anything that cannot run — a deferred feature, a command with nothing selected — is dimmed, marked `aria-disabled`, shows its reason as a badge, and is inert on `Enter`. It still matches the query, because a search for "remove" with nothing selected is better answered with *Select a worktree first* than with nothing.

**Destructive commands route, they never arm.** `Remove worktree…` reveals the inspector; `Remove repository…` opens the repository browser with the repository selected. The existing inline confirmations are where removal actually happens. A fuzzy-matched palette entry must not put a confirmation one keystroke away (AGENTS.md section 44).

**Action submenu.** `Tab` on a highlighted repository or worktree replaces the list with actions scoped to that item — reveal, copy path, refresh, create, open in terminal, launch agent, remove. `Shift + Tab`, `ArrowLeft` or `Escape` comes back out, restoring the query that was typed before. The submenu consumes the first `Escape`; only the second closes the overlay.

**Accessibility.** Section headings are `role="presentation"` list items inside the single listbox rather than nested groups, so `aria-activedescendant` keeps working and `ArrowUp`/`ArrowDown` cross a boundary without the user noticing one exists. `Tab` is always swallowed inside the palette: this is a command surface, and focus belongs in the field.

---

## 5. Keyboard Interaction & Navigation Map

| Shortcut | Context | Action |
| --- | --- | --- |
| `Super + W` / `Cmd + K` | Global | Toggle Quick Launch Overlay |
| `Cmd + O` | Global | Switch to Cockpit View |
| `Esc` | Modal / Drawer / Tray | Close active overlay or return focus to Cockpit |
| `↑` / `↓` | Cockpit / Quick Launch | Navigate selected worktree node |
| `Enter` | Selected Worktree | Open worktree in default terminal / editor |
| `⌥A` | Selected Worktree | Launch configured AI Coding Agent (e.g., Codex / Claude Code) |
| `Tab` | Quick Launch | Show actions for the highlighted repository or worktree |
| `Shift + Tab` / `←` | Quick Launch submenu | Return to the main result list |
| `Tab` | Cockpit | Toggle L2 Repositories sidebar collapse |
| `Shift + Tab` | Cockpit | Toggle Right Inspector panel collapse |

---

## 6. Theme Integration Verification Checklist

- [x] All surfaces adopt `--canvas-bg` (#EEF3F8), `--card-bg` (#FFFFFF), and `--l2-panel-bg` (#DCE5EF).
- [x] High-contrast text uses Slate-900 (#0F172A) for primary elements and Slate-600 (#475569) for secondary labels.
- [x] Telemetry states correctly utilize high-visibility badge tokens (`--badge-high`, `--badge-mod`, `--badge-good`).
- [x] Micro-spacing enforces dense row heights (≤ 40px per worktree entry).
- [x] Structural borders adhere strictly to `--card-border` (#E0E7F0) and `--l2-divider` (#C8D5E3).

---

## 7. Implementation Status

The desktop UI implements this specification as of release 0.0.6. Deviations, all deliberate:

**Keyboard map (section 5).** `Tab` / `Shift + Tab` toggle the side panels **only while focus is inside the cockpit worktree list**, which is a composite widget with a roving tabindex where `↑` / `↓` already move the selection. Everywhere else — toolbar, forms, inspector, launcher — `Tab` keeps its native focus behaviour. Overriding it globally would have made the app unnavigable by keyboard, contradicting AGENTS.md section 43.

`Super + W` is an OS-global shortcut requiring the Tauri global-shortcut plugin and window show/hide (release 0.0.7). The Quick Launch overlay opens on `Cmd/Ctrl + K` and from the L1 rail until then.

`Enter` opens the selected worktree in Warp. `⌥A` launches the configured default agent in that worktree.

**Telemetry with no data source.** Agent session pills, the stash pill and the tray process count are built to this specification and render inert — empty, or disabled with an explanatory tooltip — rather than showing placeholder values. Each is listed in ROADMAP.md under "Deferred UI wiring" against the release that will feed it. Stash counts are not on the roadmap at all: `Worktree` has no `stashCount` field. Terminal and agent row actions are live as of 0.0.5 and 0.0.6.

**Theme.** The specification's palette is light-only. A neutral dark theme was added on top of it in release 0.0.4 and is documented in section 8; the light tokens are unchanged.

**Brand fills.** Section 2.1 gives one brand colour, `--brand-accent` (#06B6D4). White text on it measures 2.4:1, below the contrast floor in AGENTS.md section 43, so solid brand surfaces (the primary button) use `--brand-strong` (#0E7490, already in the palette as `--badge-good-text`) with `--brand-ink` for the label. `--brand-accent` keeps its role for focus rings, selection bars, dividers and dots, where it is not carrying text.

**Tokens in code.** `apps/desktop/src/styles/tokens.css` carries the section 2.1 `:root` block verbatim as the source of truth, then maps it into Tailwind's `@theme` so components reference utilities (`bg-canvas`, `text-ink-muted`) rather than hex values. Fonts are self-hosted via `@fontsource` packages; the Tauri CSP permits no remote font host.

---

## 8. Neutral Dark Theme

Added in release 0.0.4. Selected in Settings → Configuration → Theme, persisted on `ForestConfiguration.theme` as `system` (the default) | `light` | `dark`.

**Mechanism.** `resolveTheme` maps the preference to a concrete theme — `system` reads `prefers-color-scheme`, which the webview forwards from the desktop environment — and `useTheme` writes it to `data-theme` on the document element. `tokens.css` re-declares the same token names under `:root[data-theme="dark"]`, so every utility repaints from that single attribute and no component knows which theme is active. `main.tsx` applies the system preference before the first paint, so the loading screen does not flash light on a dark desktop.

**Palette.** Deliberately achromatic: the greys carry no blue cast, leaving the cyan accent and the telemetry badges as the only saturated colours on screen.

| Token | Light | Dark |
| --- | --- | --- |
| `--canvas-bg` | `#EEF3F8` | `#131416` |
| `--card-bg` | `#FFFFFF` | `#1B1D1F` |
| `--card-border` | `#E0E7F0` | `#2E3134` |
| `--l1-rail-bg` | `#FFFFFF` | `#1B1D1F` |
| `--l1-icon-inactive` | `#91A0B2` | `#8B9096` |
| `--l1-divider` | `#E0E7F0` | `#2E3134` |
| `--l2-panel-bg` | `#DCE5EF` | `#17191B` |
| `--l2-text-active` | `#0F172A` | `#F2F4F6` |
| `--l2-text-muted` | `#475569` | `#A3A9B0` |
| `--l2-divider` | `#C8D5E3` | `#2E3134` |
| `--brand-accent` | `#06B6D4` | `#22D3EE` |
| `--text-primary` | `#0F172A` | `#F2F4F6` |
| `--text-secondary` | `#475569` | `#A3A9B0` |
| `--badge-high-bg` / `-text` | `#FFE4E6` / `#E11D48` | `#3A1F26` / `#FDA4AF` |
| `--badge-mod-bg` / `-text` | `#FEF9C3` / `#CA8A04` | `#35301C` / `#FACC15` |
| `--badge-good-bg` / `-text` | `#CFFAFE` / `#0E7490` | `#123239` / `#67E8F9` |
| `--overlay-scrim` | `rgb(15 23 42 / 0.4)` | `rgb(0 0 0 / 0.6)` |

Badge fills become low-luminance tints with light text, preserving the light theme's severity ordering (rose > yellow > cyan). `--brand-strong` and `--brand-ink` are shared by both themes: white on `#0E7490` reads at 4.9:1 against either canvas.

**Window.** The initial window is 1440 × 900 with a 1100 × 640 minimum. The four-tier stage in section 3 needs roughly 1100px before the inspector starts squeezing the central workspace, so the minimum is set at that point rather than left to the platform default.

**Switching.** Both controls persist immediately: the rail button cycles `system → light → dark` and the Settings select writes on change. Theme is the one configuration field that does not wait for **Save configuration** — it is a preview-by-nature setting, and leaving it unsaved would desynchronise the two controls.

---

## 9. Title Bar

The GTK header bar the window manager draws is ~50px tall and duplicates what section 3.1's top bar already shows. `decorations: false` removes it, and the application top bar becomes the title bar:

- `data-tauri-drag-region` on the header, the app name and the tagline makes a drag move the window and a double-click toggle maximize. Tauri checks the *event target*, so the attribute has to be on each element that should be draggable, not just their container.
- `WindowControls` renders minimize / maximize / close at the right edge, after the tray trigger and a hairline divider. The maximize button tracks `isMaximized` through `onResized`, so double-click-to-maximize keeps the icon honest.
- `WindowResizeGrips` restores the resize edges. An undecorated GTK window loses the frame the compositor resizes by, so eight 4–8px zones hand the drag back through `startResizeDragging`. They are `aria-hidden` buttons outside the tab order: a pointer-drag affordance has no keyboard equivalent, and window managers already expose resizing to the keyboard.
- The version left the bar entirely and lives in Settings → Forest status. The bar now carries window controls, and a build number is reference material, not something to read at a glance.

This needs seven `core:window:*` permissions in `capabilities/default.json`; `core:default` grants only the informational window getters.

**Net effect:** the app went from two stacked bars totalling ~90px to one 40px bar.
