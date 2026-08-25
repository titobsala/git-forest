import type { AgentSession, WorktreeId } from "../types/forest";

export function isActiveSession(session: AgentSession): boolean {
  return session.status === "starting" || session.status === "running";
}

export function activeSessionCount(sessions: readonly AgentSession[]): number {
  return sessions.filter(isActiveSession).length;
}

export function hasActiveSession(
  sessions: readonly AgentSession[],
  worktreeId: WorktreeId,
): boolean {
  return sessions.some(
    (session) => session.worktreeId === worktreeId && isActiveSession(session),
  );
}

export function compareSessionsNewestFirst(
  left: AgentSession,
  right: AgentSession,
): number {
  const launched = (right.launchedAt ?? "").localeCompare(
    left.launchedAt ?? "",
  );
  if (launched !== 0) {
    return launched;
  }
  return right.id.localeCompare(left.id);
}

export function primarySessionForWorktree(
  sessions: readonly AgentSession[],
  worktreeId: WorktreeId,
): AgentSession | null {
  const active = sessions.filter(
    (session) => session.worktreeId === worktreeId && isActiveSession(session),
  );
  if (active.length === 0) {
    return null;
  }
  return [...active].sort(compareSessionsNewestFirst)[0] ?? null;
}
