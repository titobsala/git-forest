/**
 * Stash telemetry pill — docs/design.md sections 3.1 and 4.1.
 *
 * AWAITING BACKEND: no release currently owns stash counts. `Worktree` has no
 * `stashCount` field and `git/status.rs` does not read the stash reflog, so
 * callers pass `count={null}` and this renders nothing. Tracked in ROADMAP.md
 * under "Deferred UI wiring".
 *
 * To wire: add `stashCount` to the `Worktree` domain type and pass it through.
 */

interface StashPillProps {
  count: number | null;
}

export function StashPill({ count }: StashPillProps) {
  if (count === null || count === 0) {
    return null;
  }

  return (
    <span
      className="gf-badge gf-badge-mod"
      title={`${count} stashed ${count === 1 ? "entry" : "entries"}`}
    >
      {count} stash
    </span>
  );
}
