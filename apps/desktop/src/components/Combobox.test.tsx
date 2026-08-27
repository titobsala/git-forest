import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Combobox, type ComboboxGroup } from "./Combobox";

const groups: ComboboxGroup[] = [
  {
    label: "Local branches",
    options: [
      { value: "main", label: "main" },
      { value: "develop", label: "develop" },
    ],
  },
  {
    label: "Remote branches",
    options: [
      {
        value: "refs/remotes/origin/feat/example",
        label: "origin/feat/example",
      },
    ],
  },
];

function Harness({
  initial = "main",
  onChange = vi.fn(),
  disabled = false,
}: {
  initial?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <span id="base-ref-label">Base ref</span>
      <Combobox
        labelledBy="base-ref-label"
        groups={groups}
        value={value}
        disabled={disabled}
        onChange={(next) => {
          onChange(next);
          setValue(next);
        }}
      />
    </>
  );
}

describe("Combobox", () => {
  it("does not render a native select", () => {
    render(<Harness />);
    expect(document.querySelector("select")).toBeNull();
    expect(
      screen.getByRole("combobox", { name: "Base ref" }),
    ).toBeInTheDocument();
  });

  it("shows grouped options after opening and commits the option value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await user.click(screen.getByRole("combobox", { name: "Base ref" }));
    const list = await screen.findByRole("listbox");
    expect(within(list).getByText("Local branches")).toBeInTheDocument();
    expect(within(list).getByText("Remote branches")).toBeInTheDocument();

    await user.click(
      screen.getByRole("option", { name: "origin/feat/example" }),
    );
    expect(onChange).toHaveBeenCalledWith("refs/remotes/origin/feat/example");
    expect(screen.getByRole("combobox", { name: "Base ref" })).toHaveValue(
      "origin/feat/example",
    );
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("filters options as the user types", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const combo = screen.getByRole("combobox", { name: "Base ref" });
    await user.click(combo);
    await user.type(combo, "feat");

    expect(
      screen.getByRole("option", { name: "origin/feat/example" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "develop" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "main" }),
    ).not.toBeInTheDocument();
  });

  it("selects the highlighted option with Enter without submitting a form", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: { preventDefault: () => void }) => {
      event.preventDefault();
    });
    const onChange = vi.fn();
    render(
      <form onSubmit={onSubmit}>
        <Harness onChange={onChange} />
        <button type="submit">Save</button>
      </form>,
    );

    await user.click(screen.getByRole("combobox", { name: "Base ref" }));
    await user.keyboard("{ArrowDown}{Enter}");

    expect(onChange).toHaveBeenCalledWith("develop");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("closes the list on Escape without bubbling", async () => {
    const user = userEvent.setup();
    const onEscape = vi.fn();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onEscape();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    try {
      render(<Harness />);

      await user.click(screen.getByRole("combobox", { name: "Base ref" }));
      expect(await screen.findByRole("listbox")).toBeInTheDocument();
      await user.keyboard("{Escape}");

      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      expect(onEscape).not.toHaveBeenCalled();
      expect(screen.getByRole("combobox", { name: "Base ref" })).toHaveValue(
        "main",
      );
    } finally {
      window.removeEventListener("keydown", onKeyDown);
    }
  });

  it("does not open when disabled", async () => {
    const user = userEvent.setup();
    render(<Harness disabled />);
    await user.click(screen.getByRole("combobox", { name: "Base ref" }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
