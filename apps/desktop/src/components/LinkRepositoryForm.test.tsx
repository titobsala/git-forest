import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LinkRepositoryForm } from "./LinkRepositoryForm";
import { pickDirectory } from "../lib/dialog";

vi.mock("../lib/dialog", () => ({
  pickDirectory: vi.fn(),
}));

describe("LinkRepositoryForm", () => {
  it("imports a linked repository from the form", () => {
    const onImport = vi.fn();
    render(<LinkRepositoryForm busy={false} onImport={onImport} />);

    fireEvent.change(screen.getByLabelText("Display name (optional)"), {
      target: { value: "Game" },
    });
    fireEvent.change(screen.getByLabelText("Directory path"), {
      target: { value: "/tmp/game" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Link repository" }));

    expect(onImport).toHaveBeenCalledWith({
      name: "Game",
      path: "/tmp/game",
    });
  });

  it("fills the path from the directory picker", async () => {
    vi.mocked(pickDirectory).mockResolvedValue("/tmp/picked");
    render(<LinkRepositoryForm busy={false} onImport={vi.fn()} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Browse…" })[0]!);
    expect(await screen.findByDisplayValue("/tmp/picked")).toBeInTheDocument();
  });
});
