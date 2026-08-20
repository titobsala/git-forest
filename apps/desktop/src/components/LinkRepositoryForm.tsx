import { FormEvent, useState } from "react";
import { pickDirectory } from "../lib/dialog";
import type { ImportRepositoryInput } from "../types/forest";

interface LinkRepositoryFormProps {
  busy: boolean;
  onImport: (input: ImportRepositoryInput) => void;
}

export function LinkRepositoryForm({
  busy,
  onImport,
}: LinkRepositoryFormProps) {
  const [name, setName] = useState("");
  const [path, setPath] = useState("");

  async function handleBrowse() {
    const selected = await pickDirectory();
    if (selected) {
      setPath(selected);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onImport({
      path: path.trim(),
      name: name.trim() || undefined,
    });
  }

  return (
    <section className="panel" aria-labelledby="link-heading">
      <h2 id="link-heading">Link repository</h2>
      <p className="hint">
        Index an existing Git repository without moving it. Forest validates the
        Git root and stores Linked metadata only.
      </p>
      <form className="stack" onSubmit={handleSubmit}>
        <label className="field">
          <span>Display name (optional)</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="off"
          />
        </label>
        <label className="field">
          <span>Directory path</span>
          <input
            value={path}
            onChange={(event) => setPath(event.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <div className="button-row">
          <button
            type="button"
            className="secondary"
            onClick={() => void handleBrowse()}
          >
            Browse…
          </button>
          <button type="submit" disabled={busy || path.trim() === ""}>
            Link repository
          </button>
        </div>
      </form>
    </section>
  );
}
