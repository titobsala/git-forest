/**
 * Quick Launch result construction — docs/design.md section 4.3.
 *
 * Pure so ranking stays testable and the overlay does no work beyond
 * rendering (AGENTS.md section 28: the launcher must feel immediate).
 */

import type { Repository, Worktree } from "../../types/forest";
import type { RepositoryWorktree } from "../../hooks/useWorktreeIndex";
import { branchLabel } from "../cockpit/telemetry";

export type LaunchResultKind = "repository" | "worktree";

export interface LaunchResult {
  id: string;
  kind: LaunchResultKind;
  /** Primary line, e.g. `EXOG App / feat/risk-483`. */
  title: string;
  /** Secondary monospace line: the filesystem path. */
  subtitle: string;
  repository: Repository;
  worktree: Worktree | null;
}

const MAX_RESULTS = 40;

function score(haystack: string, needle: string): number {
  const index = haystack.indexOf(needle);
  if (index === -1) {
    return -1;
  }
  // Prefix matches rank above interior matches; shorter targets win ties.
  return (index === 0 ? 0 : 100 + index) + haystack.length / 1000;
}

/**
 * Rank repositories and worktrees against a query.
 *
 * Worktrees outrank repositories at equal score: the user is far more often
 * looking for a branch than for the repository root.
 */
export function buildResults(
  repositories: Repository[],
  worktrees: RepositoryWorktree[],
  query: string,
): LaunchResult[] {
  const needle = query.trim().toLowerCase();

  const candidates: Array<{ result: LaunchResult; rank: number }> = [];

  for (const repository of repositories) {
    const result: LaunchResult = {
      id: `repository:${repository.id}`,
      kind: "repository",
      title: repository.name,
      subtitle: repository.path,
      repository,
      worktree: null,
    };

    if (!needle) {
      candidates.push({ result, rank: 1000 });
      continue;
    }

    const rank = score(
      `${repository.name} ${repository.path}`.toLowerCase(),
      needle,
    );
    if (rank >= 0) {
      candidates.push({ result, rank: rank + 1 });
    }
  }

  for (const { repository, worktree } of worktrees) {
    const branch = branchLabel(worktree);
    const result: LaunchResult = {
      id: `worktree:${worktree.id}`,
      kind: "worktree",
      title: `${repository.name} / ${branch}`,
      subtitle: worktree.path,
      repository,
      worktree,
    };

    if (!needle) {
      candidates.push({ result, rank: 999 });
      continue;
    }

    const rank = score(
      `${branch} ${worktree.name} ${repository.name} ${worktree.path}`.toLowerCase(),
      needle,
    );
    if (rank >= 0) {
      candidates.push({ result, rank });
    }
  }

  return candidates
    .sort((left, right) => left.rank - right.rank)
    .slice(0, MAX_RESULTS)
    .map((candidate) => candidate.result);
}
