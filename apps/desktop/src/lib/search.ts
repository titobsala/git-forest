import type { Repository } from "../types/forest";

export function repositoryMatches(
  repository: Repository,
  query: string,
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return true;
  }

  const haystack = [
    repository.name,
    repository.path,
    repository.primaryBranch ?? "",
    repository.remoteUrl ?? "",
  ]
    .join(" ")
    .toLowerCase();

  return needle.split(/\s+/).every((part) => haystack.includes(part));
}
