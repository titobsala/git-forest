import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ScanRepositoriesPanel } from "./ScanRepositoriesPanel";
import {
  cancelRepositoryScan,
  listenToScanComplete,
  listenToScanProgress,
  startRepositoryScan,
} from "../lib/scan";
import type {
  ScanCompletedPayload,
  ScanProgressPayload,
} from "../types/forest";
import { FALLBACK_FOREST_STATE } from "../types/forest";

vi.mock("../lib/scan", () => ({
  startRepositoryScan: vi.fn(),
  cancelRepositoryScan: vi.fn(),
  listenToScanProgress: vi.fn(),
  listenToScanComplete: vi.fn(),
}));

vi.mock("../lib/dialog", () => ({
  pickDirectory: vi.fn(),
}));

describe("ScanRepositoriesPanel", () => {
  it("starts, reports progress, cancels, and imports selected candidates", async () => {
    let progressHandler: ((payload: ScanProgressPayload) => void) | undefined;
    let completeHandler: ((payload: ScanCompletedPayload) => void) | undefined;
    vi.mocked(listenToScanProgress).mockImplementation(async (handler) => {
      progressHandler = handler;
      return () => undefined;
    });
    vi.mocked(listenToScanComplete).mockImplementation(async (handler) => {
      completeHandler = handler;
      return () => undefined;
    });
    vi.mocked(startRepositoryScan).mockResolvedValue("scan-1");
    vi.mocked(cancelRepositoryScan).mockResolvedValue();
    const onImport = vi.fn().mockResolvedValue({
      imported: [],
      skipped: [],
      failed: [],
      state: FALLBACK_FOREST_STATE,
    });

    render(<ScanRepositoriesPanel busy={false} onImport={onImport} />);

    fireEvent.change(screen.getByLabelText("Scan root"), {
      target: { value: "/tmp/projects" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Start scan" }));

    await waitFor(() => {
      expect(startRepositoryScan).toHaveBeenCalledWith("/tmp/projects", 4);
    });

    progressHandler?.({
      scanId: "scan-1",
      directoriesVisited: 3,
      candidatesFound: 1,
      currentPath: "/tmp/projects/exog-app",
      warnings: [],
      cancelled: false,
    });
    expect(
      await screen.findByText(/Scanning \/tmp\/projects\/exog-app/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel scan" }));
    await waitFor(() => {
      expect(cancelRepositoryScan).toHaveBeenCalledWith("scan-1");
    });

    completeHandler?.({
      scanId: "scan-1",
      directoriesVisited: 8,
      cancelled: true,
      warnings: ["unreadable /tmp/projects/secret"],
      candidates: [
        {
          path: "/tmp/projects/exog-app",
          name: "exog-app",
          primaryBranch: "main",
          remoteUrl: null,
          alreadyIndexed: false,
        },
        {
          path: "/tmp/projects/indexed",
          name: "indexed",
          primaryBranch: "main",
          remoteUrl: null,
          alreadyIndexed: true,
        },
      ],
    });

    expect(await screen.findByText(/Scan cancelled/)).toBeInTheDocument();
    expect(
      screen.getByText("unreadable /tmp/projects/secret"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/indexed/)).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Import selected" }));
    await waitFor(() => {
      expect(onImport).toHaveBeenCalledWith(["/tmp/projects/exog-app"]);
    });
  });
  it("does not restore a scan ID that completed before start returned", async () => {
    let completeHandler: ((payload: ScanCompletedPayload) => void) | undefined;
    let resolveStart: ((scanId: string) => void) | undefined;
    vi.mocked(listenToScanProgress).mockResolvedValue(() => undefined);
    vi.mocked(listenToScanComplete).mockImplementation(async (handler) => {
      completeHandler = handler;
      return () => undefined;
    });
    vi.mocked(startRepositoryScan).mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveStart = resolve;
        }),
    );

    render(
      <ScanRepositoriesPanel
        busy={false}
        onImport={vi.fn().mockResolvedValue({
          imported: [],
          skipped: [],
          failed: [],
          state: FALLBACK_FOREST_STATE,
        })}
      />,
    );

    fireEvent.change(screen.getByLabelText("Scan root"), {
      target: { value: "/tmp/empty" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Start scan" }));
    await waitFor(() => expect(startRepositoryScan).toHaveBeenCalled());

    completeHandler?.({
      scanId: "scan-fast",
      directoriesVisited: 1,
      cancelled: false,
      warnings: [],
      candidates: [],
    });
    resolveStart?.("scan-fast");

    expect(await screen.findByText(/Scan complete/)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Start scan" })).toBeEnabled();
      expect(
        screen.getByRole("button", { name: "Cancel scan" }),
      ).toBeDisabled();
    });
  });
});
