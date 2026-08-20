import type { ReactNode } from "react";
import type { ForestState } from "../types/forest";

interface AppShellProps {
  state: ForestState;
  error: string | null;
  children: ReactNode;
}

export function AppShell({ state, error, children }: AppShellProps) {
  return (
    <main className="milestone">
      <header className="milestone-header">
        <h1>{state.appInfo.name}</h1>
        <p className="version">Version {state.appInfo.version}</p>
        <p className="tagline">{state.appInfo.tagline}</p>
      </header>

      {error ? (
        <p className="banner" role="alert">
          {error}
        </p>
      ) : null}

      {children}
    </main>
  );
}
