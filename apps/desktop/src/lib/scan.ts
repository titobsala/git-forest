import { listen } from "@tauri-apps/api/event";
import { invokeCommand } from "./tauri";
import type {
  ScanCompletedPayload,
  ScanProgressPayload,
} from "../types/forest";

export const SCAN_PROGRESS_EVENT = "repository-scan-progress";
export const SCAN_COMPLETE_EVENT = "repository-scan-complete";

export async function startRepositoryScan(
  root: string,
  maxDepth?: number,
): Promise<string> {
  return invokeCommand<string>("start_repository_scan", {
    root,
    maxDepth,
  });
}

export async function cancelRepositoryScan(scanId: string): Promise<void> {
  await invokeCommand<void>("cancel_repository_scan", { scanId });
}

export async function listenToScanProgress(
  handler: (payload: ScanProgressPayload) => void,
): Promise<() => void> {
  try {
    const unlisten = await listen<ScanProgressPayload>(
      SCAN_PROGRESS_EVENT,
      (event) => handler(event.payload),
    );
    return unlisten;
  } catch {
    return () => undefined;
  }
}

export async function listenToScanComplete(
  handler: (payload: ScanCompletedPayload) => void,
): Promise<() => void> {
  try {
    const unlisten = await listen<ScanCompletedPayload>(
      SCAN_COMPLETE_EVENT,
      (event) => handler(event.payload),
    );
    return unlisten;
  } catch {
    return () => undefined;
  }
}
