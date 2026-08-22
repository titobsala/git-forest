/**
 * Query matching shared by the launcher's two ranked lists.
 *
 * Both `results.ts` (repositories and worktrees) and `commands.ts` rank
 * against the same typed query, so the scorer lives here rather than being
 * duplicated with two chances to drift.
 */

/** No match. Callers drop candidates scoring below zero. */
export const NO_MATCH = -1;

/**
 * Rank a candidate string against an already-lowercased needle.
 *
 * Lower is better. Prefix matches rank above interior matches; shorter
 * targets win ties, so `main` beats `maintenance-branch` for "main".
 */
export function score(haystack: string, needle: string): number {
  const index = haystack.indexOf(needle);
  if (index === -1) {
    return NO_MATCH;
  }

  return (index === 0 ? 0 : 100 + index) + haystack.length / 1000;
}
