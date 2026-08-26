import { invokeCommand } from "./tauri";
import type {
  CleanupPreview,
  CleanupRequest,
  CleanupResult,
} from "../types/forest";

export async function previewCleanup(): Promise<CleanupPreview> {
  return invokeCommand<CleanupPreview>("preview_cleanup");
}

export async function runCleanup(
  request: CleanupRequest,
): Promise<CleanupResult> {
  return invokeCommand<CleanupResult>("run_cleanup", { request });
}
