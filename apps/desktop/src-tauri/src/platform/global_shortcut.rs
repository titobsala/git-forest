//! OS-global launcher shortcut. Registration lives in Rust so the frontend
//! never receives a generic shortcut API (AGENTS.md section 30).

use tauri::{Emitter, Runtime};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

pub const LAUNCHER_GLOBAL_TOGGLE_EVENT: &str = "launcher-global-toggle";
const SUPER_W: &str = "Super+W";

pub fn plugin<R: Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                let _ = app.emit(LAUNCHER_GLOBAL_TOGGLE_EVENT, ());
            }
        })
        .build()
}

pub fn register<R: Runtime>(app: &tauri::App<R>) {
    if let Err(error) = app.global_shortcut().register(SUPER_W) {
        eprintln!(
            "Git Forest: Super+W is unavailable ({error}); use Ctrl/Cmd+K to open Quick Launch."
        );
    }
}
