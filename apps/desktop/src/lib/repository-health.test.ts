import { describe, expect, it } from "vitest";
import { sampleRepository } from "../types/forest";
import {
  canLocateRepository,
  isRepositoryAvailable,
  repositoryHealthLabel,
  repositoryHealthText,
} from "./repository-health";

describe("repository health copy", () => {
  it("maps each health state to a fixed label", () => {
    expect(repositoryHealthLabel("unknown")).toBe("Checking");
    expect(repositoryHealthLabel("available")).toBe("Available");
    expect(repositoryHealthLabel("missing")).toBe("Missing or moved");
    expect(repositoryHealthLabel("invalid")).toBe("Not a Git repository");
    expect(repositoryHealthLabel("unavailable")).toBe("Unavailable");
  });

  it("uses healthDetail for unavailable repositories", () => {
    expect(
      repositoryHealthText(
        sampleRepository({
          health: "unavailable",
          healthDetail: "Permission denied",
        }),
      ),
    ).toBe("Permission denied");
  });

  it("offers locate only for missing or invalid health, not parsed messages", () => {
    expect(canLocateRepository(sampleRepository({ health: "missing" }))).toBe(
      true,
    );
    expect(canLocateRepository(sampleRepository({ health: "invalid" }))).toBe(
      true,
    );
    expect(
      canLocateRepository(
        sampleRepository({
          health: "unavailable",
          healthDetail: "Missing or moved",
        }),
      ),
    ).toBe(false);
    expect(isRepositoryAvailable(sampleRepository({ health: "unknown" }))).toBe(
      false,
    );
  });
});
