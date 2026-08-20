import { open } from "@tauri-apps/plugin-dialog";

export async function pickDirectory(): Promise<string | null> {
  const selected = await open({
    directory: true,
    multiple: false,
    title: "Choose a directory",
  });
  if (typeof selected === "string" && selected.length > 0) {
    return selected;
  }
  return null;
}
