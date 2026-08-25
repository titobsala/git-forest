import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { AppErrorBoundary } from "./app/AppErrorBoundary";
import { applyTheme, resolveTheme, systemPrefersDark } from "./hooks/useTheme";

// The stored preference only arrives with the forest state, so paint the first
// frame using the desktop environment's preference instead of flashing light.
applyTheme(resolveTheme("system", systemPrefersDark()));

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element #root was not found.");
}

createRoot(rootElement).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
);
