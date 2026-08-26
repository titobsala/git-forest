import { Component, type ErrorInfo, type ReactNode } from "react";
import { toCommandError } from "../lib/errors";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  error: unknown | null;
}

/**
 * Last-resort render recovery. A thrown child must not blank the window.
 */
export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  public override state: AppErrorBoundaryState = { error: null };

  public static getDerivedStateFromError(
    error: unknown,
  ): AppErrorBoundaryState {
    return { error };
  }

  public override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error("Git Forest render failed", error, info.componentStack);
  }

  public override render(): ReactNode {
    if (this.state.error === null) {
      return this.props.children;
    }

    const message = toCommandError(this.state.error).message;

    return (
      <div className="grid h-full place-items-center bg-canvas p-6">
        <div className="gf-surface max-w-md space-y-3 p-4">
          <h1 className="text-heading text-ink">Git Forest could not render</h1>
          <p role="alert" className="text-body text-ink-muted">
            {message}
          </p>
          <button
            type="button"
            className="gf-button gf-button-primary"
            onClick={() => window.location.reload()}
          >
            Reload Git Forest
          </button>
        </div>
      </div>
    );
  }
}
