/**
 * Worktree telemetry derivation.
 *
 * Pure functions mapping the `Worktree` domain type onto the badge vocabulary
 * in docs/design.md section 4.1. Kept free of React so the badge rules can be
 * tested directly and reused by the launcher and inspector.
 */

import type { Worktree } from "../../types/forest";

export type TelemetryTone = "high" | "mod" | "good" | "neutral";

export interface TelemetryBadge {
  /** Stable key for lists and test queries. */
  id: string;
  label: string;
  tone: TelemetryTone;
  /** Longer form surfaced as a tooltip / accessible description. */
  title: string;
}

export function isDirty(worktree: Worktree): boolean {
  return worktree.trackedChanges > 0 || worktree.untrackedFiles > 0;
}

/**
 * Commit drift pill, e.g. `2↑ 1↓`. Null when the branch has no upstream or is
 * exactly in sync, so clean rows stay visually quiet.
 */
export function driftLabel(worktree: Worktree): string | null {
  const ahead = worktree.ahead ?? 0;
  const behind = worktree.behind ?? 0;

  if (ahead === 0 && behind === 0) {
    return null;
  }

  const parts: string[] = [];
  if (ahead > 0) {
    parts.push(`${ahead}↑`);
  }
  if (behind > 0) {
    parts.push(`${behind}↓`);
  }

  return parts.join(" ");
}

/**
 * Ordered badges for a worktree row. Blocking conditions come first so the
 * most important state is closest to the branch name.
 */
export function telemetryBadges(worktree: Worktree): TelemetryBadge[] {
  const badges: TelemetryBadge[] = [];

  if (!worktree.present) {
    badges.push({
      id: "missing",
      label: "missing",
      tone: "high",
      title: "The worktree directory is no longer on disk",
    });
  }

  if (!worktree.gitKnown) {
    badges.push({
      id: "unknown",
      label: "unknown",
      tone: "high",
      title: "Git no longer tracks this worktree",
    });
  }

  if (worktree.locked) {
    badges.push({
      id: "locked",
      label: "locked",
      tone: "mod",
      title: worktree.lockReason ?? "The worktree is locked",
    });
  }

  if (worktree.prunable) {
    badges.push({
      id: "prunable",
      label: "prunable",
      tone: "mod",
      title: "Git reports this worktree as prunable",
    });
  }

  if (isDirty(worktree)) {
    const detail = [
      worktree.trackedChanges > 0 ? `${worktree.trackedChanges} tracked` : null,
      worktree.untrackedFiles > 0
        ? `${worktree.untrackedFiles} untracked`
        : null,
    ]
      .filter((part): part is string => part !== null)
      .join(", ");

    badges.push({
      id: "dirty",
      label: "dirty",
      tone: "high",
      title: `Uncommitted changes: ${detail}`,
    });
  } else if (worktree.present && worktree.gitKnown) {
    badges.push({
      id: "clean",
      label: "clean",
      tone: "good",
      title: "No uncommitted changes",
    });
  }

  return badges;
}

/** Tree connector for a worktree at `index` within a group of `total` rows. */
export function hierarchyMarker(index: number, total: number): string {
  return index === total - 1 ? "└──" : "├──";
}

/** Branch label falling back to a short detached-HEAD form. */
export function branchLabel(worktree: Worktree): string {
  if (worktree.branch) {
    return worktree.branch;
  }

  if (worktree.detached && worktree.head) {
    return `detached @ ${worktree.head.slice(0, 7)}`;
  }

  return worktree.name;
}
