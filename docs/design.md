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

- **Backdrop:** Translucent dark overlay (`bg-slate-900/40 backdrop-blur-sm`).
- **Card:** `max-w-2xl` floating surface with immediate autofocus search input.
- **Results Row:** Lists matching repositories, branches, and paths with inline keyhints (`↵ Open Cockpit`, `⌥A Launch Agent`, `Esc Close`).

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

The desktop UI implements this specification as of release 0.0.4. Deviations, all deliberate:

**Keyboard map (section 5).** `Tab` / `Shift + Tab` toggle the side panels **only while focus is inside the cockpit worktree list**, which is a composite widget with a roving tabindex where `↑` / `↓` already move the selection. Everywhere else — toolbar, forms, inspector, launcher — `Tab` keeps its native focus behaviour. Overriding it globally would have made the app unnavigable by keyboard, contradicting AGENTS.md section 43.

`Super + W` is an OS-global shortcut requiring the Tauri global-shortcut plugin and window show/hide (release 0.0.7). The Quick Launch overlay opens on `Cmd/Ctrl + K` and from the L1 rail until then.

`Enter` and `⌥A` are registered and resolve, but do nothing yet: they need the terminal provider (0.0.5) and agent runner (0.0.6).

**Telemetry with no data source.** Agent session pills, the Warp/Cursor row actions, the stash pill and the tray process count are built to this specification and render inert — empty, or disabled with an explanatory tooltip — rather than showing placeholder values. Each is listed in ROADMAP.md under "Deferred UI wiring" against the release that will feed it. Stash counts are not on the roadmap at all: `Worktree` has no `stashCount` field.

**Theme.** The token set is light-only, as specified. There is no dark palette; `color-scheme` is pinned to `light`.

**Tokens in code.** `apps/desktop/src/styles/tokens.css` carries the section 2.1 `:root` block verbatim as the source of truth, then maps it into Tailwind's `@theme` so components reference utilities (`bg-canvas`, `text-ink-muted`) rather than hex values. Fonts are self-hosted via `@fontsource` packages; the Tauri CSP permits no remote font host.
