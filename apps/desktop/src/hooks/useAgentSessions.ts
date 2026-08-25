/**
 * Live agent-session list. The hook owns loading and error state, coalesces
 * overlapping refreshes, reloads on visibility regain, and polls every 10s
 * only while the document is visible.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { errorMessage } from "../lib/errors";
import { listAgentSessions } from "../lib/agents";
import {
  activeSessionCount,
  hasActiveSession as worktreeHasActiveSession,
  primarySessionForWorktree,
} from "../lib/agent-sessions";
import type { AgentSession, WorktreeId } from "../types/forest";

const POLL_MS = 10_000;

type SessionLoadStatus = "loading" | "ready" | "error";

export interface AgentSessionsState {
  sessions: AgentSession[];
  status: SessionLoadStatus;
  error: string | null;
  refresh: () => Promise<void>;
  activeCount: number;
  hasActiveSession: (worktreeId: WorktreeId) => boolean;
  primarySession: (worktreeId: WorktreeId) => AgentSession | null;
}

export function useAgentSessions(): AgentSessionsState {
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [status, setStatus] = useState<SessionLoadStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  const inFlight = useRef<Promise<void> | null>(null);
  const pending = useRef(false);
  const cancelled = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) {
      pending.current = true;
      return inFlight.current;
    }

    const run = (async () => {
      try {
        const next = await listAgentSessions();
        if (cancelled.current) {
          return;
        }
        setSessions(next);
        setStatus("ready");
        setError(null);
      } catch (caught: unknown) {
        if (cancelled.current) {
          return;
        }
        setError(errorMessage(caught));
        setStatus("error");
      } finally {
        inFlight.current = null;
        if (pending.current && !cancelled.current) {
          pending.current = false;
          void refresh();
        }
      }
    })();

    inFlight.current = run;
    return run;
  }, []);

  useEffect(() => {
    cancelled.current = false;
    void refresh();

    function onVisibility() {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    }

    document.addEventListener("visibilitychange", onVisibility);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    }, POLL_MS);

    return () => {
      cancelled.current = true;
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(timer);
    };
  }, [refresh]);

  const activeCount = useMemo(() => activeSessionCount(sessions), [sessions]);

  const hasActiveSession = useCallback(
    (worktreeId: WorktreeId) => worktreeHasActiveSession(sessions, worktreeId),
    [sessions],
  );

  const primarySession = useCallback(
    (worktreeId: WorktreeId) => primarySessionForWorktree(sessions, worktreeId),
    [sessions],
  );

  return {
    sessions,
    status,
    error,
    refresh,
    activeCount,
    hasActiveSession,
    primarySession,
  };
}
