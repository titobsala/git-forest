import { invokeCommand } from "./tauri";
import type {
  ForestState,
  RegisterRepositoryInput,
  Repository,
} from "../types/forest";

export async function listRepositories(): Promise<Repository[]> {
  return invokeCommand<Repository[]>("list_repositories");
}

export async function registerRepository(
  input: RegisterRepositoryInput,
): Promise<ForestState> {
  return invokeCommand<ForestState>("register_repository", {
    name: input.name,
    path: input.path,
    mode: input.mode,
  });
}
