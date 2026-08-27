/**
 * Filterable combobox: type to narrow grouped options, then commit one value.
 *
 * Built for keyboard-first forms. The input is a combobox, the popup is a
 * listbox, and `aria-activedescendant` tracks the highlighted option. Typed
 * text only filters; the committed value is always an option's `value`.
 */

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type Ref,
} from "react";
import { ChevronIcon } from "./shell/icons";

export interface ComboboxOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface ComboboxGroup {
  label: string;
  options: ComboboxOption[];
}

export interface ComboboxProps {
  groups: ComboboxGroup[];
  value: string;
  onChange: (value: string) => void;
  labelledBy?: string;
  "aria-label"?: string;
  placeholder?: string;
  disabled?: boolean;
  emptyMessage?: string;
  ref?: Ref<HTMLInputElement>;
}

function optionMatches(option: ComboboxOption, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  const haystack = `${option.label} ${option.value}`.toLowerCase();
  return needle.split(/\s+/).every((part) => haystack.includes(part));
}

function flatten(groups: ComboboxGroup[]): ComboboxOption[] {
  return groups.flatMap((group) => group.options);
}

function findOption(
  groups: ComboboxGroup[],
  value: string,
): ComboboxOption | undefined {
  return flatten(groups).find((option) => option.value === value);
}

export function Combobox({
  groups,
  value,
  onChange,
  labelledBy,
  placeholder = "Filter…",
  disabled = false,
  emptyMessage = "Nothing matches",
  "aria-label": ariaLabel,
  ref,
}: ComboboxProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const selected = findOption(groups, value);

  const visibleGroups = useMemo(() => {
    const needle = open ? query : "";
    return groups
      .map((group) => ({
        ...group,
        options: group.options.filter((option) =>
          optionMatches(option, needle),
        ),
      }))
      .filter((group) => group.options.length > 0);
  }, [groups, open, query]);

  const rows = useMemo(() => flatten(visibleGroups), [visibleGroups]);
  const active = rows.length === 0 ? 0 : Math.min(activeIndex, rows.length - 1);

  useEffect(() => {
    if (disabled) {
      setOpen(false);
      setQuery("");
    }
  }, [disabled]);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current?.contains(event.target as Node)) {
        return;
      }
      setOpen(false);
      setQuery("");
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function close() {
    setOpen(false);
    setQuery("");
  }

  function highlightSelected() {
    const index = flatten(groups).findIndex((option) => option.value === value);
    setActiveIndex(index >= 0 ? index : 0);
  }

  function openList() {
    if (disabled) {
      return;
    }
    highlightSelected();
    setQuery("");
    setOpen(true);
  }

  function choose(index: number) {
    const option = rows[index];
    if (!option || option.disabled) {
      return;
    }
    onChange(option.value);
    close();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (disabled) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        openList();
        return;
      }
      setActiveIndex(Math.min(active + 1, Math.max(rows.length - 1, 0)));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        openList();
        return;
      }
      setActiveIndex(Math.max(active - 1, 0));
      return;
    }

    if (event.key === "Home" && open) {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }

    if (event.key === "End" && open) {
      event.preventDefault();
      setActiveIndex(Math.max(rows.length - 1, 0));
      return;
    }

    if (event.key === "Enter" && open) {
      event.preventDefault();
      choose(active);
      return;
    }

    if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }

    if (event.key === "Tab" && open) {
      close();
    }
  }

  const display = open ? query : (selected?.label ?? "");

  return (
    <div ref={rootRef} className="combobox">
      <div className="relative">
        <input
          ref={ref}
          value={display}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={open ? listId : undefined}
          aria-activedescendant={
            open && rows[active] ? `${listId}-${active}` : undefined
          }
          aria-autocomplete="list"
          aria-labelledby={labelledBy}
          aria-label={ariaLabel}
          className="pr-7 font-mono"
          onChange={(event) => {
            if (!open) {
              setOpen(true);
            }
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
          onClick={() => {
            if (!open) {
              openList();
            }
          }}
          onKeyDown={handleKeyDown}
        />
        <span
          className={`pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2 text-ink-muted ${open ? "rotate-90" : ""}`}
        >
          <ChevronIcon />
        </span>
      </div>
      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-labelledby={labelledBy}
          aria-label={ariaLabel}
          className="gf-surface absolute z-20 mt-0.5 max-h-52 w-full overflow-y-auto shadow-xl"
        >
          {rows.length === 0 ? (
            <li className="px-2 py-2 text-body text-ink-muted">
              {query.trim()
                ? `${emptyMessage} “${query.trim()}”.`
                : emptyMessage}
            </li>
          ) : (
            visibleGroups.map((group) => (
              <li key={group.label} role="presentation">
                <p className="gf-label bg-canvas px-2 py-1 font-mono text-micro tracking-wide uppercase">
                  {group.label}
                </p>
                <ul role="presentation">
                  {group.options.map((option) => {
                    const index = rows.indexOf(option);
                    const highlighted = index === active;
                    const disabledOption = option.disabled === true;
                    return (
                      <li
                        key={option.value}
                        id={`${listId}-${index}`}
                        role="option"
                        aria-selected={highlighted}
                        aria-disabled={disabledOption || undefined}
                        onMouseEnter={() => setActiveIndex(index)}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          if (!disabledOption) {
                            choose(index);
                          }
                        }}
                        className={[
                          "cursor-pointer px-2 py-1 font-mono text-mono-code text-ink",
                          highlighted ? "bg-badge-good/40" : "",
                          disabledOption ? "cursor-default opacity-50" : "",
                        ].join(" ")}
                      >
                        {option.label}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
