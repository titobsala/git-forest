import { invokeCommand } from "./tauri";
import type {
  BranchCatalog,
  CreateWorktreeInput,
  CreateWorktreePreview,
  CreateWorktreeResult,
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

export async function listBranchCatalog(
  repositoryId: RepositoryId,
): Promise<BranchCatalog> {
  return invokeCommand<BranchCatalog>("list_branch_catalog", { repositoryId });
}

export async function fetchBranchCatalog(
  repositoryId: RepositoryId,
): Promise<BranchCatalog> {
  return invokeCommand<BranchCatalog>("fetch_branch_catalog", { repositoryId });
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
