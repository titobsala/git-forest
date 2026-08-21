import { describe, expect, it } from "vitest";
import { repositoryMatches } from "./search";
import { sampleRepository } from "../types/forest";

describe("repositoryMatches", () => {
  const repository = sampleRepository();

  it("matches name, path, branch, and remote tokens", () => {
    expect(repositoryMatches(repository, "")).toBe(true);
    expect(repositoryMatches(repository, "exog")).toBe(true);
    expect(repositoryMatches(repository, "feat missing")).toBe(false);
    expect(repositoryMatches(repository, "main example.test")).toBe(true);
    expect(repositoryMatches(repository, "/tmp/exog-app")).toBe(true);
  });
});
