import { invokeCommand } from "./tauri";
import type { AppInfo } from "../types/app-info";

export async function getAppInfo(): Promise<AppInfo> {
  return invokeCommand<AppInfo>("get_app_info");
}
