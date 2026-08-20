use std::path::{Path, PathBuf};

use tauri::{App, Manager};

use crate::domain::{ForestError, ForestPaths};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlatformPaths {
    app_data_dir: PathBuf,
    home_dir: PathBuf,
}

impl PlatformPaths {
    pub fn new(app_data_dir: PathBuf, home_dir: PathBuf) -> Self {
        Self {
            app_data_dir,
            home_dir,
        }
    }

    pub fn from_app(app: &App) -> Result<Self, ForestError> {
        let resolver = app.path();
        let app_data_dir = resolver
            .app_data_dir()
            .map_err(|error| ForestError::Platform(error.to_string()))?;
        let home_dir = resolver
            .home_dir()
            .map_err(|error| ForestError::Platform(error.to_string()))?;
        Ok(Self::new(app_data_dir, home_dir))
    }

    pub fn app_data_dir(&self) -> &Path {
        &self.app_data_dir
    }

    pub fn home_dir(&self) -> &Path {
        &self.home_dir
    }

    pub fn default_forest_root(&self) -> PathBuf {
        self.home_dir.join("forest")
    }

    pub fn database_path(&self) -> PathBuf {
        self.app_data_dir.join("forest.db")
    }

    pub fn resolved(&self, forest_root: PathBuf) -> ForestPaths {
        ForestPaths {
            app_data_dir: self.app_data_dir.clone(),
            database_path: self.database_path(),
            forest_root,
        }
    }

    pub fn expand_user_path(&self, path: PathBuf) -> PathBuf {
        let raw = path.to_string_lossy();
        if raw == "~" {
            self.home_dir.clone()
        } else if let Some(rest) = raw.strip_prefix("~/") {
            self.home_dir.join(rest)
        } else {
            path
        }
    }

    pub fn ensure_forest_layout(forest_root: &Path) -> Result<(), ForestError> {
        std::fs::create_dir_all(forest_root.join("repos"))?;
        std::fs::create_dir_all(forest_root.join("worktrees"))?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::PlatformPaths;
    use std::path::PathBuf;

    #[test]
    fn default_forest_root_is_home_forest() {
        let platform =
            PlatformPaths::new(PathBuf::from("/tmp/app-data"), PathBuf::from("/tmp/home"));

        assert_eq!(
            platform.default_forest_root(),
            PathBuf::from("/tmp/home/forest")
        );
        assert_eq!(
            platform.database_path(),
            PathBuf::from("/tmp/app-data/forest.db")
        );
    }

    #[test]
    fn expands_home_shortcut_paths() {
        let platform =
            PlatformPaths::new(PathBuf::from("/tmp/app-data"), PathBuf::from("/tmp/home"));

        assert_eq!(
            platform.expand_user_path(PathBuf::from("~/forest")),
            PathBuf::from("/tmp/home/forest")
        );
        assert_eq!(
            platform.expand_user_path(PathBuf::from("~")),
            PathBuf::from("/tmp/home")
        );
        assert_eq!(
            platform.expand_user_path(PathBuf::from("/var/repos/exog")),
            PathBuf::from("/var/repos/exog")
        );
    }

    #[test]
    fn ensure_forest_layout_creates_managed_directories() {
        let root = std::env::temp_dir().join(format!("git-forest-layout-{}", uuid::Uuid::new_v4()));
        PlatformPaths::ensure_forest_layout(&root).expect("create layout");

        assert!(root.join("repos").is_dir());
        assert!(root.join("worktrees").is_dir());
        let _ = std::fs::remove_dir_all(&root);
    }
}
