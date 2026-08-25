/**
 * Quick Launch overlay — docs/design.md section 4.3.
 *
 * Raycast-style modal over two ranked, grouped lists: commands first, then
 * repositories and worktrees. One query filters both. Tab on a highlighted
 * repository or worktree drops into a submenu of actions scoped to that item;
 * Shift+Tab, ArrowLeft or Escape comes back out.
 *
 * The overlay renders and navigates — it never knows what a command does.
 * `commands` and `actionContext` come from `App`, which owns the state they
 * mutate.
 *
 * Section headings are `role="presentation"` list items inside the single
 * listbox rather than nested groups, so `aria-activedescendant` keeps working
 * and ArrowUp/ArrowDown cross a boundary without the user noticing one exists.
 *
 * NOTE: `Super + W` is registered natively. `Cmd/Ctrl + K` remains the
 * in-app toggle and does not hide the window.
 */

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { shortcutLabel, type ShortcutId } from "../../lib/keymap";
import type { Repository, Worktree } from "../../types/forest";
import type { RepositoryWorktree } from "../../hooks/useWorktreeIndex";
import { buildActions, filterActions, type ActionContext } from "./actions";
import { filterCommands, type Command } from "./commands";
import { buildResults, type LaunchResult } from "./results";

/** One rendered line. Normalising commands, places and actions into a single
 *  shape keeps keyboard navigation index-based and section-agnostic. */
interface Row {
  key: string;
  badge: string;
  title: string;
  subtitle: string;
  disabledReason?: string | undefined;
  shortcut?: ShortcutId | undefined;
  /** The state already in effect, e.g. the active theme. */
  current?: boolean | undefined;
  /** Set on repositories and worktrees, which have a Tab submenu. */
  result?: LaunchResult | undefined;
  run: () => void;
}

interface Section {
  id: string;
  label: string;
  rows: Row[];
}

interface QuickLaunchProps {
  open: boolean;
  onClose: () => void;
  repositories: Repository[];
  worktrees: RepositoryWorktree[];
  commands: Command[];
  actionContext: ActionContext;
  onOpenRepository: (repository: Repository) => void;
  onOpenWorktreeInTerminal: (
    worktree: Worktree,
    repository: Repository,
  ) => void;
}

export function QuickLaunch({
  open,
  onClose,
  repositories,
  worktrees,
  commands,
  actionContext,
  onOpenRepository,
  onOpenWorktreeInTerminal,
}: QuickLaunchProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [actionsFor, setActionsFor] = useState<LaunchResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  // Restored when the submenu closes, so Tab-then-back does not lose the query.
  const rootQuery = useRef("");

  const sections = useMemo<Section[]>(() => {
    // Ranking is skipped entirely while the overlay is closed: this component
    // stays mounted, and App re-renders on every state change.
    if (!open) {
      return [];
    }

    if (actionsFor) {
      const rows = filterActions(
        buildActions(actionsFor, actionContext),
        query,
      ).map<Row>((action) => ({
        key: `action:${action.id}`,
        badge: "run",
        title: action.title,
        subtitle: action.subtitle ?? "",
        disabledReason: action.disabledReason,
        run: action.run,
      }));

      return [{ id: "actions", label: actionsFor.title, rows }];
    }

    const commandRows = filterCommands(commands, query).map<Row>((command) => ({
      key: `command:${command.id}`,
      badge: "cmd",
      title: command.title,
      subtitle: command.subtitle ?? "",
      disabledReason: command.disabledReason,
      shortcut: command.shortcut,
      current: command.current,
      run: command.run,
    }));

    const placeRows = buildResults(repositories, worktrees, query).map<Row>(
      (result) => ({
        key: result.id,
        badge: result.kind === "worktree" ? "wt" : "repo",
        title: result.title,
        subtitle: result.subtitle,
        result,
        run: () => {
          if (result.worktree) {
            onOpenWorktreeInTerminal(result.worktree, result.repository);
          } else {
            onOpenRepository(result.repository);
          }
        },
      }),
    );

    return [
      { id: "commands", label: "Commands", rows: commandRows },
      { id: "places", label: "Repositories & worktrees", rows: placeRows },
    ].filter((section) => section.rows.length > 0);
  }, [
    open,
    actionsFor,
    actionContext,
    commands,
    query,
    repositories,
    worktrees,
    onOpenRepository,
    onOpenWorktreeInTerminal,
  ]);

  const rows = useMemo(
    () => sections.flatMap((section) => section.rows),
    [sections],
  );

  // Options are numbered across the whole listbox, not per section, so arrow
  // keys cross a heading without a gap.
  const indexByKey = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((row, index) => map.set(row.key, index));
    return map;
  }, [rows]);

  // Reset to a clean slate every time the overlay opens.
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      setActionsFor(null);
      rootQuery.current = "";
      inputRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, actionsFor]);

  if (!open) {
    return null;
  }

  function openActions(result: LaunchResult) {
    rootQuery.current = query;
    setQuery("");
    setActionsFor(result);
  }

  function closeActions() {
    setActionsFor(null);
    setQuery(rootQuery.current);
  }

  function choose(index: number) {
    const row = rows[index];
    if (!row || row.disabledReason !== undefined) {
      return;
    }
    row.run();
    onClose();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) =>
        Math.min(current + 1, Math.max(rows.length - 1, 0)),
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      choose(activeIndex);
      return;
    }

    if (event.key === "Tab") {
      // Always swallowed: this is a command palette, focus belongs in the field.
      event.preventDefault();
      if (event.shiftKey) {
        if (actionsFor) {
          closeActions();
        }
        return;
      }

      const result = rows[activeIndex]?.result;
      if (result) {
        openActions(result);
      }
      return;
    }

    if (event.key === "ArrowLeft" && actionsFor && query === "") {
      event.preventDefault();
      closeActions();
      return;
    }

    if (event.key === "Escape" && actionsFor) {
      // The submenu consumes the first Escape. React's synthetic
      // stopPropagation reaches the native event, so App's window-level
      // `overlay.close` handler does not also fire and close the overlay.
      event.preventDefault();
      event.stopPropagation();
      closeActions();
    }
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
        <div className="flex items-center gap-2 border-b border-card-border px-3 py-2">
          {actionsFor ? (
            <span className="gf-badge gf-badge-good shrink-0 max-w-[40%] truncate">
              {actionsFor.title}
            </span>
          ) : null}
          <label className="sr-only" htmlFor={`${listId}-input`}>
            {actionsFor
              ? `Search actions for ${actionsFor.title}`
              : "Search commands, repositories, branches and paths"}
          </label>
          <input
            id={`${listId}-input`}
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              actionsFor
                ? "Search actions…"
                : "Search commands, repositories, branches…"
            }
            autoComplete="off"
            spellCheck={false}
            role="combobox"
            aria-expanded
            aria-controls={listId}
            aria-activedescendant={
              rows[activeIndex] ? `${listId}-${activeIndex}` : undefined
            }
            className="w-full bg-transparent font-mono text-heading text-ink outline-none placeholder:text-ink-muted/60"
          />
        </div>

        <ul
          id={listId}
          role="listbox"
          aria-label={actionsFor ? "Actions" : "Results"}
          className="max-h-80 overflow-y-auto"
        >
          {rows.length === 0 ? (
            <li className="px-3 py-4 text-body text-ink-muted">
              Nothing matches “{query}”.
            </li>
          ) : (
            sections.map((section) => (
              <li key={section.id} role="presentation">
                <p className="gf-label bg-canvas px-3 py-1 font-mono text-micro tracking-wide uppercase">
                  {section.label}
                </p>
                <ul role="presentation">
                  {section.rows.map((row) => {
                    const index = indexByKey.get(row.key) ?? 0;
                    const active = index === activeIndex;
                    const disabled = row.disabledReason !== undefined;

                    return (
                      <li
                        key={row.key}
                        id={`${listId}-${index}`}
                        role="option"
                        aria-selected={active}
                        aria-disabled={disabled || undefined}
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
                          "flex h-row items-center gap-2 px-3",
                          disabled
                            ? "cursor-default opacity-50"
                            : "cursor-pointer",
                          active ? "bg-badge-good/40" : "",
                        ].join(" ")}
                      >
                        <span className="gf-badge gf-badge-neutral shrink-0">
                          {row.badge}
                        </span>
                        <span className="truncate font-mono text-mono-code font-semibold text-ink">
                          {row.title}
                        </span>
                        {row.current ? (
                          <span className="gf-badge gf-badge-good shrink-0">
                            current
                          </span>
                        ) : null}
                        <span className="ml-auto flex shrink-0 items-center gap-2">
                          {row.disabledReason ? (
                            <span className="gf-badge gf-badge-mod">
                              {row.disabledReason}
                            </span>
                          ) : (
                            <span className="max-w-[22rem] truncate font-mono text-micro text-ink-muted">
                              {row.subtitle}
                            </span>
                          )}
                          {row.shortcut ? (
                            <span className="gf-keyhint">
                              {shortcutLabel(row.shortcut)}
                            </span>
                          ) : null}
                          {row.result && active ? (
                            <span className="gf-keyhint">
                              {shortcutLabel("launcher.actions")}
                            </span>
                          ) : null}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))
          )}
        </ul>

        <div className="flex flex-wrap items-center gap-2 border-t border-card-border bg-canvas px-3 py-1.5">
          <span className="gf-keyhint">↵ Run</span>
          {actionsFor ? (
            <>
              <span className="gf-keyhint">⇧Tab Back</span>
              <span className="gf-keyhint">Esc Back</span>
            </>
          ) : (
            <>
              <span className="gf-keyhint">
                {shortcutLabel("launcher.actions")} Actions
              </span>
              <span className="gf-keyhint">Esc Close</span>
            </>
          )}
          <span className="ml-auto font-mono text-micro text-ink-muted">
            {rows.length} results
          </span>
        </div>
      </div>
    </div>
  );
}
