/**
 * Quick Launch overlay — docs/design.md section 4.3.
 *
 * Raycast-style modal: translucent backdrop, autofocused search, flat result
 * list over repositories and worktrees, inline keyhints.
 *
 * NOTE: this is the in-app half. `Super + W` is an OS-global shortcut and
 * needs the Tauri global-shortcut plugin plus window show/hide, which arrives
 * with release 0.0.7. Until then the overlay opens on Cmd/Ctrl+K and from the
 * L1 rail.
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { shortcutLabel } from "../../lib/keymap";
import type { Repository, Worktree } from "../../types/forest";
import type { RepositoryWorktree } from "../../hooks/useWorktreeIndex";
import { buildResults } from "./results";

interface QuickLaunchProps {
  open: boolean;
  onClose: () => void;
  repositories: Repository[];
  worktrees: RepositoryWorktree[];
  onOpenRepository: (repository: Repository) => void;
  onOpenWorktree: (worktree: Worktree, repository: Repository) => void;
}

export function QuickLaunch({
  open,
  onClose,
  repositories,
  worktrees,
  onOpenRepository,
  onOpenWorktree,
}: QuickLaunchProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const results = useMemo(
    () => buildResults(repositories, worktrees, query),
    [repositories, worktrees, query],
  );

  // Reset to a clean slate every time the overlay opens.
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      inputRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!open) {
    return null;
  }

  function choose(index: number) {
    const result = results[index];
    if (!result) {
      return;
    }
    if (result.worktree) {
      onOpenWorktree(result.worktree, result.repository);
    } else {
      onOpenRepository(result.repository);
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-scrim p-4 pt-[12vh] backdrop-blur-sm">
      {/* Real button so dismissing by backdrop is reachable by pointer and by
          assistive technology; Escape closes it too. */}
      <button
        type="button"
        aria-label="Close Quick Launch"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Quick Launch"
        className="gf-surface relative w-full max-w-2xl overflow-hidden shadow-xl"
      >
        <div className="border-b border-card-border px-3 py-2">
          <label className="sr-only" htmlFor={`${listId}-input`}>
            Search repositories, branches and paths
          </label>
          <input
            id={`${listId}-input`}
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((current) =>
                  Math.min(current + 1, Math.max(results.length - 1, 0)),
                );
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((current) => Math.max(current - 1, 0));
              } else if (event.key === "Enter") {
                event.preventDefault();
                choose(activeIndex);
              }
            }}
            placeholder="Search repositories, branches, paths…"
            autoComplete="off"
            spellCheck={false}
            role="combobox"
            aria-expanded
            aria-controls={listId}
            aria-activedescendant={
              results[activeIndex] ? `${listId}-${activeIndex}` : undefined
            }
            className="w-full bg-transparent font-mono text-heading text-ink outline-none placeholder:text-ink-muted/60"
          />
        </div>

        <ul
          id={listId}
          role="listbox"
          aria-label="Results"
          className="max-h-80 overflow-y-auto"
        >
          {results.length === 0 ? (
            <li className="px-3 py-4 text-body text-ink-muted">
              Nothing matches “{query}”.
            </li>
          ) : (
            results.map((result, index) => (
              <li
                key={result.id}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                tabIndex={-1}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(index)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    choose(index);
                  }
                }}
                className={[
                  "flex h-row cursor-pointer items-center gap-2 px-3",
                  index === activeIndex ? "bg-badge-good/40" : "",
                ].join(" ")}
              >
                <span className="gf-badge gf-badge-neutral shrink-0">
                  {result.kind === "worktree" ? "wt" : "repo"}
                </span>
                <span className="truncate font-mono text-mono-code font-semibold text-ink">
                  {result.title}
                </span>
                <span className="ml-auto truncate font-mono text-micro text-ink-muted">
                  {result.subtitle}
                </span>
              </li>
            ))
          )}
        </ul>

        <div className="flex flex-wrap items-center gap-2 border-t border-card-border bg-canvas px-3 py-1.5">
          <span className="gf-keyhint">↵ Open Cockpit</span>
          <span
            className="gf-keyhint opacity-60"
            title="Agent launching arrives in release 0.0.6"
          >
            {shortcutLabel("selection.agent")} Launch Agent
          </span>
          <span className="gf-keyhint">Esc Close</span>
          <span className="ml-auto font-mono text-micro text-ink-muted">
            {results.length} results
          </span>
        </div>
      </div>
    </div>
  );
}
