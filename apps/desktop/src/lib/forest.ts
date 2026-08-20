import { invokeCommand } from "./tauri";
import type { ForestConfiguration, ForestState } from "../types/forest";

export async function getForestState(): Promise<ForestState> {
  return invokeCommand<ForestState>("get_forest_state");
}

export async function updateForestConfiguration(
  configuration: ForestConfiguration,
): Promise<ForestState> {
  return invokeCommand<ForestState>("update_forest_configuration", {
    configuration,
  });
}
