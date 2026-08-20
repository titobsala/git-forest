use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub tagline: String,
}

impl AppInfo {
    pub fn current() -> Self {
        Self {
            name: "Git Forest".to_owned(),
            version: env!("CARGO_PKG_VERSION").to_owned(),
            tagline: "Configuration rooted.".to_owned(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::AppInfo;

    #[test]
    fn current_app_info_matches_crate_metadata() {
        let info = AppInfo::current();

        assert_eq!(info.name, "Git Forest");
        assert_eq!(info.version, env!("CARGO_PKG_VERSION"));
        assert_eq!(info.tagline, "Configuration rooted.");
    }

    #[test]
    fn current_app_info_serializes_for_the_frontend() {
        let json = serde_json::to_value(AppInfo::current()).expect("serialize");

        assert_eq!(json["name"], "Git Forest");
        assert_eq!(json["version"], env!("CARGO_PKG_VERSION"));
        assert_eq!(json["tagline"], "Configuration rooted.");
    }
}
