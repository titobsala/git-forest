use crate::domain::AppInfo;

#[tauri::command]
pub fn get_app_info() -> AppInfo {
    AppInfo::current()
}
