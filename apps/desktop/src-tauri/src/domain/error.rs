use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum ForestError {
    #[error("database error: {0}")]
    Database(String),
    #[error("io error: {0}")]
    Io(String),
    #[error("serialization error: {0}")]
    Serialization(String),
    #[error("platform path error: {0}")]
    Platform(String),
    #[error("invalid timestamp: {0}")]
    InvalidTimestamp(String),
    #[error("forest configuration is missing")]
    ConfigurationMissing,
    #[error("repository path must be absolute")]
    PathNotAbsolute,
    #[error("repository path does not exist or is not a directory")]
    PathNotDirectory,
    #[error("a repository is already registered at this path")]
    DuplicatePath,
    #[error("repository name must not be empty")]
    EmptyName,
    #[error("forest root must be an absolute path")]
    ForestRootNotAbsolute,
    #[error("unknown default agent: {0}")]
    UnknownAgent(String),
    #[error("application state lock was poisoned")]
    MutexPoisoned,
}

impl From<rusqlite::Error> for ForestError {
    fn from(error: rusqlite::Error) -> Self {
        Self::Database(error.to_string())
    }
}

impl From<std::io::Error> for ForestError {
    fn from(error: std::io::Error) -> Self {
        Self::Io(error.to_string())
    }
}

impl From<serde_json::Error> for ForestError {
    fn from(error: serde_json::Error) -> Self {
        Self::Serialization(error.to_string())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandError {
    pub code: String,
    pub message: String,
}

impl From<ForestError> for CommandError {
    fn from(error: ForestError) -> Self {
        let code = match &error {
            ForestError::Database(_) => "database",
            ForestError::Io(_) => "io",
            ForestError::Serialization(_) => "serialization",
            ForestError::Platform(_) => "platform",
            ForestError::InvalidTimestamp(_) => "invalid_timestamp",
            ForestError::ConfigurationMissing => "configuration_missing",
            ForestError::PathNotAbsolute => "path_not_absolute",
            ForestError::PathNotDirectory => "path_not_directory",
            ForestError::DuplicatePath => "duplicate_path",
            ForestError::EmptyName => "empty_name",
            ForestError::ForestRootNotAbsolute => "forest_root_not_absolute",
            ForestError::UnknownAgent(_) => "unknown_agent",
            ForestError::MutexPoisoned => "mutex_poisoned",
        };

        Self {
            code: code.to_owned(),
            message: error.to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{CommandError, ForestError};

    #[test]
    fn maps_duplicate_path_to_a_stable_command_code() {
        let error = CommandError::from(ForestError::DuplicatePath);
        assert_eq!(error.code, "duplicate_path");
        assert_eq!(
            error.message,
            "a repository is already registered at this path"
        );
    }
}
