import { describe, expect, it } from "vitest";
import { NO_MATCH, score } from "./score";

describe("score", () => {
  it("reports no match when the needle is absent", () => {
    expect(score("feat/risk-483", "zzz")).toBe(NO_MATCH);
  });

  it("ranks a prefix match above an interior one", () => {
    expect(score("main", "main")).toBeLessThan(score("feat/main", "main"));
  });

  it("breaks ties in favour of the shorter target", () => {
    expect(score("main", "main")).toBeLessThan(
      score("maintenance-branch", "main"),
    );
  });
});
