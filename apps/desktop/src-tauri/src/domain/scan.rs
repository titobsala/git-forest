use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use super::forest::ForestState;
use super::repository::Repository;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanCandidate {
    pub path: PathBuf,
    pub name: String,
    pub primary_branch: Option<String>,
    pub remote_url: Option<String>,
    pub already_indexed: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgressPayload {
    pub scan_id: String,
    pub directories_visited: u32,
    pub candidates_found: u32,
    pub current_path: Option<PathBuf>,
    pub warnings: Vec<String>,
    pub cancelled: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanCompletedPayload {
    pub scan_id: String,
    pub directories_visited: u32,
    pub candidates: Vec<ScanCandidate>,
    pub warnings: Vec<String>,
    pub cancelled: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSkip {
    pub path: PathBuf,
    pub reason: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportFailure {
    pub path: PathBuf,
    pub code: String,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportRepositoriesResult {
    pub imported: Vec<Repository>,
    pub skipped: Vec<ImportSkip>,
    pub failed: Vec<ImportFailure>,
    pub state: ForestState,
}
