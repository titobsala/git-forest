use std::collections::{HashSet, VecDeque};
use std::path::{Path, PathBuf};

use crate::domain::ForestError;

use super::repository::inspect_repository;
use super::runner::GitRunner;

pub const DEFAULT_SCAN_DEPTH: u32 = 4;
pub const MAX_SCAN_DEPTH: u32 = 8;
pub const DEFAULT_SCAN_IGNORES: &[&str] =
    &[".git", "node_modules", "target", "dist", "build", ".cache"];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DiscoveredRepository {
    pub path: PathBuf,
    pub name: String,
    pub primary_branch: Option<String>,
    pub remote_url: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DiscoveryProgress {
    pub directories_visited: u32,
    pub candidates_found: u32,
    pub current_path: PathBuf,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DiscoveryResult {
    pub directories_visited: u32,
    pub candidates: Vec<DiscoveredRepository>,
    pub warnings: Vec<String>,
    pub cancelled: bool,
}

pub fn default_ignore_names() -> HashSet<String> {
    DEFAULT_SCAN_IGNORES
        .iter()
        .map(|name| (*name).to_owned())
        .collect()
}

pub fn discover_repositories(
    git: &GitRunner,
    root: &Path,
    max_depth: u32,
    ignore_names: &HashSet<String>,
    should_cancel: impl Fn() -> bool,
    mut on_progress: impl FnMut(&DiscoveryProgress),
) -> Result<DiscoveryResult, ForestError> {
    if max_depth > MAX_SCAN_DEPTH {
        return Err(ForestError::InvalidScanDepth);
    }
    if !root.is_absolute() {
        return Err(ForestError::PathNotAbsolute);
    }
    if !root.is_dir() {
        return Err(ForestError::ScanRootNotDirectory);
    }

    let mut directories_visited = 0_u32;
    let mut warnings = Vec::new();
    let mut candidates = Vec::new();
    let mut seen_roots = HashSet::new();
    let mut visited = HashSet::new();
    let mut queue = VecDeque::new();
    queue.push_back((root.to_path_buf(), 0_u32));

    while let Some((path, depth)) = queue.pop_front() {
        if should_cancel() {
            return Ok(DiscoveryResult {
                directories_visited,
                candidates,
                warnings,
                cancelled: true,
            });
        }

        directories_visited += 1;
        on_progress(&DiscoveryProgress {
            directories_visited,
            candidates_found: candidates.len() as u32,
            current_path: path.clone(),
            warnings: warnings.clone(),
        });

        let canonical = match path.canonicalize() {
            Ok(value) => value,
            Err(error) => {
                warnings.push(format!("skipped {}: {error}", path.display()));
                continue;
            }
        };
        if !visited.insert(canonical.clone()) {
            continue;
        }

        if canonical.join(".git").exists() {
            match inspect_repository(git, &canonical) {
                Ok(inspection) => {
                    if seen_roots.insert(inspection.root.clone()) {
                        let name = display_name(&inspection.root);
                        candidates.push(DiscoveredRepository {
                            path: inspection.root,
                            name,
                            primary_branch: inspection.primary_branch,
                            remote_url: inspection.remote_url,
                        });
                    }
                }
                Err(error) => {
                    warnings.push(format!("{}: {error}", canonical.display()));
                }
            }
            continue;
        }

        if depth >= max_depth {
            continue;
        }

        let entries = match std::fs::read_dir(&canonical) {
            Ok(entries) => entries,
            Err(error) => {
                warnings.push(format!("unreadable {}: {error}", canonical.display()));
                continue;
            }
        };

        for entry in entries {
            let entry = match entry {
                Ok(value) => value,
                Err(error) => {
                    warnings.push(format!(
                        "unreadable child of {}: {error}",
                        canonical.display()
                    ));
                    continue;
                }
            };
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if ignore_names.contains(name.as_ref()) {
                continue;
            }

            let child = entry.path();
            match entry.file_type() {
                Ok(file_type) if file_type.is_dir() || file_type.is_symlink() => {
                    if child.is_dir() {
                        queue.push_back((child, depth + 1));
                    }
                }
                Ok(_) => {}
                Err(error) => {
                    warnings.push(format!("unreadable {}: {error}", child.display()));
                }
            }
        }
    }

    Ok(DiscoveryResult {
        directories_visited,
        candidates,
        warnings,
        cancelled: false,
    })
}

pub fn display_name(root: &Path) -> String {
    root.file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .unwrap_or("repository")
        .to_owned()
}

#[cfg(test)]
mod tests {
    use super::{default_ignore_names, discover_repositories, DEFAULT_SCAN_DEPTH};
    use crate::git::runner::GitRunner;
    use crate::git::testing::TempGit;
    use std::collections::HashSet;
    use std::fs;
    use std::os::unix::fs::{symlink, PermissionsExt};
    use std::sync::atomic::{AtomicU32, Ordering};

    #[test]
    fn finds_repositories_within_depth_and_skips_ignored_directories() {
        let env = TempGit::new();
        let app = env.init_repo("projects/exog-app");
        env.commit_file(&app, "README.md", "app\n", "initial");
        let api = env.init_repo("projects/exog-api");
        env.commit_file(&api, "README.md", "api\n", "initial");
        let ignored = env.init_repo("projects/exog-app/node_modules/nested-git");
        env.commit_file(&ignored, "README.md", "ignored\n", "initial");
        fs::create_dir_all(env.path("projects/notes")).expect("notes");

        let result = discover_repositories(
            &GitRunner::new(),
            &env.path("projects"),
            DEFAULT_SCAN_DEPTH,
            &default_ignore_names(),
            || false,
            |_| {},
        )
        .expect("scan");

        let names: HashSet<_> = result
            .candidates
            .iter()
            .map(|item| item.name.clone())
            .collect();
        assert!(names.contains("exog-app"));
        assert!(names.contains("exog-api"));
        assert!(!names.contains("nested-git"));
        assert!(!result.cancelled);
    }

    #[test]
    fn stops_descending_into_a_discovered_repository() {
        let env = TempGit::new();
        let outer = env.init_repo("outer");
        env.commit_file(&outer, "README.md", "outer\n", "initial");
        let inner = env.init_repo("outer/vendor/inner");
        env.commit_file(&inner, "README.md", "inner\n", "initial");

        let result = discover_repositories(
            &GitRunner::new(),
            env.root(),
            4,
            &default_ignore_names(),
            || false,
            |_| {},
        )
        .expect("scan");

        assert_eq!(result.candidates.len(), 1);
        assert_eq!(result.candidates[0].name, "outer");
    }

    #[test]
    fn respects_max_depth() {
        let env = TempGit::new();
        let deep = env.init_repo("a/b/c/repo");
        env.commit_file(&deep, "README.md", "deep\n", "initial");

        let result = discover_repositories(
            &GitRunner::new(),
            env.root(),
            2,
            &default_ignore_names(),
            || false,
            |_| {},
        )
        .expect("scan");
        assert!(result.candidates.is_empty());
    }

    #[test]
    fn avoids_symlink_cycles_and_deduplicates_canonical_roots() {
        let env = TempGit::new();
        let repo = env.init_repo("projects/app");
        env.commit_file(&repo, "README.md", "app\n", "initial");
        symlink(&repo, env.path("projects/app-link")).expect("symlink");
        symlink(env.path("projects"), env.path("projects/loop")).expect("cycle");

        let result = discover_repositories(
            &GitRunner::new(),
            &env.path("projects"),
            4,
            &default_ignore_names(),
            || false,
            |_| {},
        )
        .expect("scan");

        assert_eq!(result.candidates.len(), 1);
        assert_eq!(result.candidates[0].name, "app");
    }

    #[test]
    fn records_unreadable_directories_as_warnings() {
        let env = TempGit::new();
        let repo = env.init_repo("visible");
        env.commit_file(&repo, "README.md", "ok\n", "initial");
        let locked = env.path("secret");
        fs::create_dir_all(&locked).expect("secret");
        fs::set_permissions(&locked, fs::Permissions::from_mode(0o000)).expect("chmod");

        let result = discover_repositories(
            &GitRunner::new(),
            env.root(),
            2,
            &default_ignore_names(),
            || false,
            |_| {},
        );
        fs::set_permissions(&locked, fs::Permissions::from_mode(0o755)).expect("restore");
        let result = result.expect("scan");

        if nix_is_root() {
            return;
        }
        assert!(result
            .warnings
            .iter()
            .any(|warning| warning.contains("secret")));
    }

    #[test]
    fn can_cancel_between_directories() {
        let env = TempGit::new();
        let first = env.init_repo("one");
        env.commit_file(&first, "README.md", "one\n", "initial");
        let second = env.init_repo("two");
        env.commit_file(&second, "README.md", "two\n", "initial");
        let seen = AtomicU32::new(0);

        let result = discover_repositories(
            &GitRunner::new(),
            env.root(),
            3,
            &default_ignore_names(),
            || seen.load(Ordering::SeqCst) >= 1,
            |_| {
                seen.fetch_add(1, Ordering::SeqCst);
            },
        )
        .expect("scan");

        assert!(result.cancelled);
        assert!(result.candidates.len() <= 1);
    }

    fn nix_is_root() -> bool {
        libc_geteuid() == 0
    }

    fn libc_geteuid() -> u32 {
        std::fs::read_to_string("/proc/self/status")
            .ok()
            .and_then(|status| {
                status
                    .lines()
                    .find(|line| line.starts_with("Uid:"))
                    .and_then(|line| line.split_whitespace().nth(1))
                    .and_then(|uid| uid.parse().ok())
            })
            .unwrap_or(1)
    }
}
