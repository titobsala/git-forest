interface TauriInternals {
  invoke: <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
}

function getTauriInternals(): TauriInternals | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  const runtime = window as Window & {
    __TAURI_INTERNALS__?: { invoke?: TauriInternals["invoke"] };
    __TAURI__?: { core?: { invoke?: TauriInternals["invoke"] } };
  };

  if (typeof runtime.__TAURI_INTERNALS__?.invoke === "function") {
    return { invoke: runtime.__TAURI_INTERNALS__.invoke };
  }

  if (typeof runtime.__TAURI__?.core?.invoke === "function") {
    return { invoke: runtime.__TAURI__.core.invoke };
  }

  return undefined;
}

export function isTauriRuntime(): boolean {
  return getTauriInternals() !== undefined;
}

export async function invokeCommand<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const internals = getTauriInternals();
  if (!internals) {
    throw {
      code: "tauri_unavailable",
      message:
        "Git Forest native commands are unavailable because the Tauri IPC bridge was not injected.",
    };
  }

  if (args === undefined) {
    return internals.invoke<T>(command);
  }

  return internals.invoke<T>(command, args);
}
