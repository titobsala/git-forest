/** Top-level views reachable from the L1 rail. */
export type ViewId = "cockpit" | "agents" | "settings";

export const VIEW_LABELS: Record<ViewId, string> = {
  cockpit: "Cockpit",
  agents: "Agents",
  settings: "Settings",
};
