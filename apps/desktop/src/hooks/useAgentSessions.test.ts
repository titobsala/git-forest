import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sampleAgentSession } from "../types/forest";
import { listAgentSessions } from "../lib/agents";
import { useAgentSessions } from "./useAgentSessions";

vi.mock("../lib/agents", () => ({
  listAgentSessions: vi.fn(),
}));

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
}

describe("useAgentSessions", () => {
  beforeEach(() => {
    setVisibility("visible");
    vi.mocked(listAgentSessions).mockResolvedValue([sampleAgentSession()]);
  });

  afterEach(() => {
    vi.useRealTimers();
    setVisibility("visible");
  });

  it("loads sessions on mount", async () => {
    const { result } = renderHook(() => useAgentSessions());
    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });
    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.activeCount).toBe(1);
    expect(result.current.hasActiveSession("wt-1")).toBe(true);
    expect(result.current.primarySession("wt-1")?.id).toBe("session-1");
  });

  it("coalesces overlapping refreshes and reruns when one was queued", async () => {
    let resolveFirst: (
      value: ReturnType<typeof sampleAgentSession>[],
    ) => void = () => {};
    vi.mocked(listAgentSessions).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFirst = resolve;
      }),
    );
    vi.mocked(listAgentSessions).mockResolvedValueOnce([
      sampleAgentSession({ id: "session-2", status: "starting" }),
    ]);

    const { result } = renderHook(() => useAgentSessions());
    await waitFor(() => {
      expect(listAgentSessions).toHaveBeenCalledTimes(1);
    });

    const first = result.current.refresh();
    const second = result.current.refresh();
    expect(listAgentSessions).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirst([sampleAgentSession()]);
      await first;
      await second;
    });

    await waitFor(() => {
      expect(listAgentSessions).toHaveBeenCalledTimes(2);
    });
    expect(result.current.primarySession("wt-1")?.id).toBe("session-2");
  });

  it("does not apply a result after unmount", async () => {
    let resolveLoad: (
      value: ReturnType<typeof sampleAgentSession>[],
    ) => void = () => {};
    vi.mocked(listAgentSessions).mockReturnValue(
      new Promise((resolve) => {
        resolveLoad = resolve;
      }),
    );

    const { unmount } = renderHook(() => useAgentSessions());
    unmount();

    await act(async () => {
      resolveLoad([sampleAgentSession()]);
    });
    expect(listAgentSessions).toHaveBeenCalledTimes(1);
  });

  it("refreshes when the document becomes visible", async () => {
    setVisibility("hidden");
    const { result } = renderHook(() => useAgentSessions());
    await waitFor(() => {
      expect(listAgentSessions).toHaveBeenCalledTimes(1);
    });

    setVisibility("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await waitFor(() => {
      expect(listAgentSessions).toHaveBeenCalledTimes(2);
    });
    expect(result.current.status).toBe("ready");
  });

  it("polls every 10 seconds only while visible", async () => {
    vi.useFakeTimers();
    vi.mocked(listAgentSessions).mockResolvedValue([sampleAgentSession()]);
    renderHook(() => useAgentSessions());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(listAgentSessions).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(listAgentSessions).toHaveBeenCalledTimes(2);

    setVisibility("hidden");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(listAgentSessions).toHaveBeenCalledTimes(2);
  });

  it("records a typed error without dropping later refreshes", async () => {
    vi.mocked(listAgentSessions).mockRejectedValueOnce({
      code: "database",
      message: "database error: locked",
    });
    const { result } = renderHook(() => useAgentSessions());
    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });
    expect(result.current.error).toBe("database error: locked");

    vi.mocked(listAgentSessions).mockResolvedValue([sampleAgentSession()]);
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.status).toBe("ready");
    expect(result.current.error).toBeNull();
  });
});
