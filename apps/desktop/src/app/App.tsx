import { useEffect, useState } from "react";
import { MilestoneScreen } from "../components/MilestoneScreen";
import { errorMessage } from "../lib/errors";
import { getForestState, updateForestConfiguration } from "../lib/forest";
import { registerRepository } from "../lib/repositories";
import type {
  ForestConfiguration,
  ForestState,
  RegisterRepositoryInput,
} from "../types/forest";
import { FALLBACK_FOREST_STATE } from "../types/forest";
import "./app.css";

type LoadStatus = "loading" | "ready" | "error";

export function App() {
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [state, setState] = useState<ForestState>(FALLBACK_FOREST_STATE);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void getForestState()
      .then((next) => {
        if (!cancelled) {
          setState(next);
          setStatus("ready");
          setError(null);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setState(FALLBACK_FOREST_STATE);
          setStatus("error");
          setError(errorMessage(caught));
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSaveConfiguration(configuration: ForestConfiguration) {
    setBusy(true);
    try {
      const next = await updateForestConfiguration(configuration);
      setState(next);
      setError(null);
      setStatus("ready");
    } catch (caught: unknown) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function handleRegisterRepository(input: RegisterRepositoryInput) {
    setBusy(true);
    try {
      const next = await registerRepository(input);
      setState(next);
      setError(null);
      setStatus("ready");
    } catch (caught: unknown) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading") {
    return (
      <main className="milestone">
        <p>Loading Forest…</p>
      </main>
    );
  }

  return (
    <MilestoneScreen
      state={state}
      error={error}
      busy={busy}
      onSaveConfiguration={(configuration) => {
        void handleSaveConfiguration(configuration);
      }}
      onRegisterRepository={(input) => {
        void handleRegisterRepository(input);
      }}
    />
  );
}
