import type { Repository, RepositoryHealth } from "../types/forest";

export function repositoryHealthLabel(health: RepositoryHealth): string {
  switch (health) {
    case "unknown":
      return "Checking";
    case "available":
      return "Available";
    case "missing":
      return "Missing or moved";
    case "invalid":
      return "Not a Git repository";
    case "unavailable":
      return "Unavailable";
  }
}

export function repositoryHealthText(repository: Repository): string {
  if (repository.health === "unavailable" && repository.healthDetail) {
    return repository.healthDetail;
  }
  return repositoryHealthLabel(repository.health);
}

export function isRepositoryAvailable(repository: Repository): boolean {
  return repository.health === "available";
}

export function canLocateRepository(repository: Repository): boolean {
  return repository.health === "missing" || repository.health === "invalid";
}

export function repositoryHealthBadgeClass(health: RepositoryHealth): string {
  switch (health) {
    case "available":
      return "gf-badge gf-badge-good";
    case "unknown":
      return "gf-badge gf-badge-neutral";
    default:
      return "gf-badge gf-badge-high";
  }
}
