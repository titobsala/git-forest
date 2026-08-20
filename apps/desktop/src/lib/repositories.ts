import { invokeCommand } from "./tauri";
import type {
  ForestState,
  ImportRepositoriesResult,
  ImportRepositoryInput,
  Repository,
  RepositoryId,
} from "../types/forest";

export async function listRepositories(): Promise<Repository[]> {
  return invokeCommand<Repository[]>("list_repositories");
}

export async function importRepository(
  input: ImportRepositoryInput,
): Promise<ForestState> {
  return invokeCommand<ForestState>("import_repository", {
    path: input.path,
    name: input.name,
  });
}

export async function importRepositories(
  paths: string[],
): Promise<ImportRepositoriesResult> {
  return invokeCommand<ImportRepositoriesResult>("import_repositories", {
    paths,
  });
}

export async function refreshRepository(
  id: RepositoryId,
): Promise<ForestState> {
  return invokeCommand<ForestState>("refresh_repository", { id });
}

export async function removeRepository(id: RepositoryId): Promise<ForestState> {
  return invokeCommand<ForestState>("remove_repository", { id });
}
