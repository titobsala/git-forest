import { invokeCommand } from "./tauri";
import type {
  CreateWorktreeInput,
  CreateWorktreePreview,
  CreateWorktreeResult,
  LocalBranch,
  RemoveWorktreeResult,
  RepositoryId,
  Worktree,
  WorktreeId,
  WorktreeRemovalPreview,
} from "../types/forest";

export async function listWorktrees(
  repositoryId: RepositoryId,
): Promise<Worktree[]> {
  return invokeCommand<Worktree[]>("list_worktrees", { repositoryId });
}

export async function refreshWorktrees(
  repositoryId: RepositoryId,
): Promise<Worktree[]> {
  return invokeCommand<Worktree[]>("refresh_worktrees", { repositoryId });
}

export async function listLocalBranches(
  repositoryId: RepositoryId,
): Promise<LocalBranch[]> {
  return invokeCommand<LocalBranch[]>("list_local_branches", { repositoryId });
}

export async function previewCreateWorktree(
  input: CreateWorktreeInput,
): Promise<CreateWorktreePreview> {
  return invokeCommand<CreateWorktreePreview>("preview_create_worktree", {
    input,
  });
}

export async function createWorktree(
  input: CreateWorktreeInput,
): Promise<CreateWorktreeResult> {
  return invokeCommand<CreateWorktreeResult>("create_worktree", { input });
}

export async function getWorktreeRemovalPreview(
  worktreeId: WorktreeId,
): Promise<WorktreeRemovalPreview> {
  return invokeCommand<WorktreeRemovalPreview>("get_worktree_removal_preview", {
    worktreeId,
  });
}

export async function removeWorktree(
  worktreeId: WorktreeId,
  force: boolean,
): Promise<RemoveWorktreeResult> {
  return invokeCommand<RemoveWorktreeResult>("remove_worktree", {
    worktreeId,
    force,
  });
}
