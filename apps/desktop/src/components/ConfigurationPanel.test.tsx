import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfigurationPanel } from "./ConfigurationPanel";
import { FALLBACK_FOREST_STATE } from "../types/forest";

describe("ConfigurationPanel", () => {
  it("saves configuration from the form", () => {
    const onSave = vi.fn();
    render(
      <ConfigurationPanel
        state={{
          ...FALLBACK_FOREST_STATE,
          databaseInitialized: true,
          schemaVersion: 2,
        }}
        busy={false}
        onSave={onSave}
      />,
    );

    fireEvent.change(screen.getByLabelText("Forest root path"), {
      target: { value: "/tmp/moved-forest" },
    });
    fireEvent.change(screen.getByLabelText("Default agent"), {
      target: { value: "claude" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save configuration" }));

    expect(onSave).toHaveBeenCalledWith({
      ...FALLBACK_FOREST_STATE.configuration,
      forestRoot: "/tmp/moved-forest",
      defaultAgentId: "claude",
    });
  });
});
