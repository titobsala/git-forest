import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RepositoryBrowser } from "./RepositoryBrowser";
import { sampleRepository } from "../types/forest";

const repositories = [
  sampleRepository(),
  sampleRepository({
    id: "repo-2",
    name: "Game",
    path: "/tmp/game",
    primaryBranch: "develop",
    remoteUrl: null,
  }),
];

describe("RepositoryBrowser", () => {
  it("filters repositories and renders metadata", () => {
    render(
      <RepositoryBrowser
        repositories={repositories}
        busy={false}
        selectedId={null}
        onSelect={vi.fn()}
        onRefresh={vi.fn()}
        onRemove={vi.fn()}
        onLocate={vi.fn()}
      />,
    );

    expect(screen.getByText("EXOG App")).toBeInTheDocument();
    expect(screen.getByText("Game")).toBeInTheDocument();
    expect(screen.getByText("/tmp/exog-app")).toBeInTheDocument();
    expect(
      screen.getByText(/https:\/\/example.test\/exog.git/),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search"), {
      target: { value: "game develop" },
    });
    expect(screen.queryByText("EXOG App")).not.toBeInTheDocument();
    expect(screen.getByText("Game")).toBeInTheDocument();
  });

  it("shows an empty search state", () => {
    render(
      <RepositoryBrowser
        repositories={repositories}
        busy={false}
        selectedId={null}
        onSelect={vi.fn()}
        onRefresh={vi.fn()}
        onRemove={vi.fn()}
        onLocate={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Search"), {
      target: { value: "no-match" },
    });
    expect(
      screen.getByText("No repositories match that search."),
    ).toBeInTheDocument();
  });

  it("refreshes and confirms index-only removal", () => {
    const onRefresh = vi.fn();
    const onRemove = vi.fn();
    render(
      <RepositoryBrowser
        repositories={repositories}
        busy={false}
        selectedId={null}
        onSelect={vi.fn()}
        onRefresh={onRefresh}
        onRemove={onRemove}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Refresh" })[0]!);
    expect(onRefresh).toHaveBeenCalledWith("repo-1");

    fireEvent.click(
      screen.getAllByRole("button", { name: "Remove from Forest" })[0]!,
    );
    expect(
      screen.getByText("Remove from Forest? The directory stays on disk."),
    ).toBeInTheDocument();
    fireEvent.click(
      within(
        screen.getByRole("region", { name: "Remove repository" }),
      ).getByRole("button", { name: "Remove from Forest" }),
    );
    expect(onRemove).toHaveBeenCalledWith("repo-1");
  });

  it("offers Locate repository for missing health without parsing messages", () => {
    const onLocate = vi.fn();
    render(
      <RepositoryBrowser
        repositories={[sampleRepository({ health: "missing" })]}
        busy={false}
        selectedId={null}
        onSelect={vi.fn()}
        onRefresh={vi.fn()}
        onRemove={vi.fn()}
        onLocate={onLocate}
      />,
    );

    expect(screen.getByText("Missing or moved")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Locate repository…" }));
    expect(onLocate).toHaveBeenCalledWith("repo-1");
  });
});
