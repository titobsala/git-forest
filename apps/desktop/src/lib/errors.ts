import type { CommandError } from "../types/forest";

const FALLBACK_ERROR: CommandError = {
  code: "unknown_error",
  message: "Something went wrong.",
};

export function toCommandError(error: unknown): CommandError {
  if (typeof error === "string" && error.length > 0) {
    return { code: "unknown_error", message: error };
  }

  if (typeof error === "object" && error !== null) {
    const candidate = error as CommandError & { error?: string };
    if (
      typeof candidate.code === "string" &&
      candidate.code.length > 0 &&
      typeof candidate.message === "string" &&
      candidate.message.length > 0
    ) {
      return { code: candidate.code, message: candidate.message };
    }
    if (typeof candidate.message === "string" && candidate.message.length > 0) {
      return { code: "unknown_error", message: candidate.message };
    }
    if (typeof candidate.error === "string" && candidate.error.length > 0) {
      return { code: "unknown_error", message: candidate.error };
    }
  }

  return { ...FALLBACK_ERROR };
}

export function errorMessage(error: unknown): string {
  return toCommandError(error).message;
}
