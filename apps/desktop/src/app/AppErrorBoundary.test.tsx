import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppErrorBoundary } from "./AppErrorBoundary";

function Boom(): never {
  throw new Error("render exploded");
}

describe("AppErrorBoundary", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a recovery surface when a child throws", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(
      <AppErrorBoundary>
        <Boom />
      </AppErrorBoundary>,
    );

    expect(
      screen.getByRole("heading", { name: "Git Forest could not render" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("render exploded");
    expect(
      screen.getByRole("button", { name: "Reload Git Forest" }),
    ).toBeInTheDocument();
  });
});
