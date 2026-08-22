import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfigurationPanel } from "./ConfigurationPanel";
import { FALLBACK_FOREST_STATE } from "../types/forest";

const state = {
  ...FALLBACK_FOREST_STATE,
  databaseInitialized: true,
  schemaVersion: 2,
};

describe("ConfigurationPanel", () => {
  it("saves configuration from the form", () => {
    const onSave = vi.fn();
    render(
      <ConfigurationPanel
        state={state}
        busy={false}
        onSave={onSave}
        onSelectTheme={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Forest root path"), {
      target: { value: "/tmp/moved-forest" },
    });
    fireEvent.change(screen.getByLabelText("Default agent"), {
      target: { value: "claude" },
    });
    fireEvent.change(screen.getByLabelText("Theme"), {
      target: { value: "dark" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save configuration" }));

    expect(onSave).toHaveBeenCalledWith({
      ...FALLBACK_FOREST_STATE.configuration,
      forestRoot: "/tmp/moved-forest",
      defaultAgentId: "claude",
      theme: "dark",
    });
  });

  it("applies a theme as soon as it is picked, without waiting for save", () => {
    const onSave = vi.fn();
    const onSelectTheme = vi.fn();
    render(
      <ConfigurationPanel
        state={state}
        busy={false}
        onSave={onSave}
        onSelectTheme={onSelectTheme}
      />,
    );

    fireEvent.change(screen.getByLabelText("Theme"), {
      target: { value: "dark" },
    });

    expect(onSelectTheme).toHaveBeenCalledWith("dark");
    expect(onSave).not.toHaveBeenCalled();
  });
});
