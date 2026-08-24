import { invokeCommand } from "./tauri";
import type { TerminalLaunchResult, WorktreeId } from "../types/forest";

export async function openWorktreeInTerminal(
  worktreeId: WorktreeId,
): Promise<TerminalLaunchResult> {
  return invokeCommand<TerminalLaunchResult>("open_worktree", { worktreeId });
}
