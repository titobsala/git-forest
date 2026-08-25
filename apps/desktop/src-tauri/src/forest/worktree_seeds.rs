use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::path::{Component, Path};

use crate::domain::{
    CommandError, ForestError, LocalFileCandidate, LocalFileCopyFailure, LocalFileCopyResult,
};
use crate::git::GitRunner;

const MAX_FILE_BYTES: u64 = 1024 * 1024;

const DISCOVER_ARGS: &[&str] = &[
    "ls-files",
    "-z",
    "--others",
    "--ignored",
    "--exclude-standard",
    "--",
    ":(top,literal).env",
    ":(top,literal).env.local",
    ":(glob,top).env.*",
];

pub fn discover_environment_files(
    git: &GitRunner,
    repository_root: &Path,
) -> Result<Vec<LocalFileCandidate>, ForestError> {
    let names = list_ignored_env_names(git, repository_root)?;
    let mut candidates = Vec::new();
    for name in names {
        if let Some(candidate) = inspect_candidate(repository_root, &name) {
            candidates.push(candidate);
        }
    }
    candidates.sort_by(|left, right| left.path.cmp(&right.path));
    candidates.dedup_by(|left, right| left.path == right.path);
    Ok(candidates)
}

pub fn copy_environment_files(
    source_root: &Path,
    destination_root: &Path,
    candidates: &[LocalFileCandidate],
) -> LocalFileCopyResult {
    let mut copied = Vec::new();
    let mut failures = Vec::new();
    for candidate in candidates {
        match copy_one(source_root, destination_root, candidate) {
            Ok(path) => copied.push(path),
            Err(failure) => failures.push(failure),
        }
    }
    if !copied.is_empty() {
        log::info!("copied {} local environment files", copied.len());
    }
    if !failures.is_empty() {
        log::warn!("failed to copy {} local environment files", failures.len());
    }
    LocalFileCopyResult { copied, failures }
}

fn list_ignored_env_names(
    git: &GitRunner,
    repository_root: &Path,
) -> Result<Vec<String>, ForestError> {
    let output = git.run_success(repository_root, DISCOVER_ARGS)?;
    let mut names = Vec::new();
    for raw in output.stdout.split(|byte| *byte == 0) {
        if raw.is_empty() {
            continue;
        }
        let Ok(text) = std::str::from_utf8(raw) else {
            continue;
        };
        let Some(name) = normalize_root_relative_name(text.trim()) else {
            continue;
        };
        if is_env_family(&name) {
            names.push(name);
        }
    }
    names.sort();
    names.dedup();
    Ok(names)
}

fn inspect_candidate(root: &Path, name: &str) -> Option<LocalFileCandidate> {
    let meta = fs::symlink_metadata(root.join(name)).ok()?;
    if meta.file_type().is_symlink() || !meta.file_type().is_file() {
        return None;
    }
    let size_bytes = meta.len();
    if size_bytes > MAX_FILE_BYTES {
        return None;
    }
    Some(LocalFileCandidate {
        path: name.to_owned(),
        size_bytes,
    })
}

fn copy_one(
    source_root: &Path,
    destination_root: &Path,
    candidate: &LocalFileCandidate,
) -> Result<String, LocalFileCopyFailure> {
    let name = normalize_root_relative_name(&candidate.path)
        .filter(|name| is_env_family(name))
        .ok_or_else(|| failure(&candidate.path, "path is not a root-relative file name"))?;
    let source = source_root.join(&name);
    let destination = destination_root.join(&name);

    if destination.symlink_metadata().is_ok() {
        return Err(failure(&name, "destination already exists"));
    }

    let meta = fs::symlink_metadata(&source)
        .map_err(|_| failure(&name, "source is not a regular file"))?;
    if meta.file_type().is_symlink() || !meta.file_type().is_file() {
        return Err(failure(&name, "source is not a regular file"));
    }
    if meta.len() > MAX_FILE_BYTES {
        return Err(failure(&name, "file exceeds 1 MiB"));
    }

    let mut source_file = OpenOptions::new()
        .read(true)
        .open(&source)
        .map_err(|_| failure(&name, "failed to read source"))?;
    let mut bytes = Vec::new();
    source_file
        .read_to_end(&mut bytes)
        .map_err(|_| failure(&name, "failed to read source"))?;
    if bytes.len() as u64 > MAX_FILE_BYTES {
        return Err(failure(&name, "file exceeds 1 MiB"));
    }

    let mut destination_file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&destination)
        .map_err(|error| {
            if error.kind() == std::io::ErrorKind::AlreadyExists {
                failure(&name, "destination already exists")
            } else {
                failure(&name, "failed to write destination")
            }
        })?;
    if destination_file.write_all(&bytes).is_err() {
        let _ = fs::remove_file(&destination);
        return Err(failure(&name, "failed to write destination"));
    }
    Ok(name)
}

fn normalize_root_relative_name(value: &str) -> Option<String> {
    if value.is_empty() || value.contains('\0') {
        return None;
    }
    let path = Path::new(value);
    if path.is_absolute() {
        return None;
    }
    let mut parts = Vec::new();
    for component in path.components() {
        match component {
            Component::Normal(part) => {
                let part = part.to_str()?;
                if part.is_empty() {
                    return None;
                }
                parts.push(part);
            }
            Component::CurDir => {}
            Component::Prefix(_) | Component::RootDir | Component::ParentDir => return None,
        }
    }
    if parts.len() != 1 {
        return None;
    }
    Some(parts[0].to_owned())
}

fn is_env_family(name: &str) -> bool {
    if matches!(name, ".env.example" | ".env.sample" | ".env.template") {
        return false;
    }
    if name == ".env" || name == ".env.local" {
        return true;
    }
    let Some(rest) = name.strip_prefix(".env.") else {
        return false;
    };
    if rest.is_empty() || rest.contains('/') {
        return false;
    }
    if let Some(mode) = rest.strip_suffix(".local") {
        return is_mode(mode);
    }
    is_mode(rest)
}

fn is_mode(mode: &str) -> bool {
    !mode.is_empty() && !mode.contains('.') && !mode.contains('/')
}

fn failure(path: &str, message: &str) -> LocalFileCopyFailure {
    LocalFileCopyFailure {
        path: path.to_owned(),
        error: CommandError {
            code: "io".into(),
            message: message.to_owned(),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::{
        copy_environment_files, discover_environment_files, is_env_family, MAX_FILE_BYTES,
    };
    use crate::domain::LocalFileCandidate;
    use crate::git::runner::GitRunner;
    use crate::git::testing::TempGit;
    use std::fs;
    use std::os::unix::fs::PermissionsExt;

    fn ignored_repo() -> (TempGit, std::path::PathBuf) {
        let env = TempGit::new();
        let repo = env.init_repo("app");
        env.commit_file(&repo, ".gitignore", ".env*\n.cache\n", "ignore local files");
        (env, repo)
    }

    #[test]
    fn env_family_matches_standard_names_and_excludes_templates() {
        assert!(is_env_family(".env"));
        assert!(is_env_family(".env.local"));
        assert!(is_env_family(".env.development"));
        assert!(is_env_family(".env.production.local"));
        assert!(!is_env_family(".env.example"));
        assert!(!is_env_family(".env.sample"));
        assert!(!is_env_family(".env.template"));
        assert!(!is_env_family(".envrc"));
        assert!(!is_env_family("nested/.env"));
        assert!(!is_env_family(".cache"));
    }

    #[test]
    fn discovers_only_ignored_root_level_env_family_files() {
        let (_env, repo) = ignored_repo();
        fs::write(repo.join(".env"), "SECRET=one\n").expect(".env");
        fs::write(repo.join(".env.local"), "SECRET=two\n").expect(".env.local");
        fs::write(repo.join(".env.development"), "SECRET=three\n").expect(".env.development");
        fs::write(repo.join(".env.development.local"), "SECRET=four\n")
            .expect(".env.development.local");
        fs::write(repo.join(".env.example"), "EXAMPLE=1\n").expect("template");
        fs::create_dir_all(repo.join("nested")).expect("nested");
        fs::write(repo.join("nested/.env"), "SECRET=nested\n").expect("nested env");
        fs::write(repo.join(".cache"), "cache\n").expect("cache");
        std::os::unix::fs::symlink("/tmp/secret", repo.join(".env.staging")).expect("symlink");
        fs::write(
            repo.join(".env.huge"),
            vec![0u8; (MAX_FILE_BYTES as usize) + 1],
        )
        .expect("huge");

        let candidates = discover_environment_files(&GitRunner::new(), &repo).expect("discover");
        let names: Vec<_> = candidates.iter().map(|item| item.path.as_str()).collect();
        assert_eq!(
            names,
            vec![
                ".env",
                ".env.development",
                ".env.development.local",
                ".env.local",
            ]
        );
        assert!(candidates.iter().all(|item| item.size_bytes > 0));
        assert_eq!(
            candidates
                .iter()
                .find(|item| item.path == ".env")
                .unwrap()
                .size_bytes,
            u64::try_from(b"SECRET=one\n".len()).unwrap()
        );
    }

    #[test]
    fn copies_candidate_bytes_without_overwriting() {
        let dir = std::env::temp_dir().join(format!("git-forest-copy-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(dir.join("src")).expect("src");
        fs::create_dir_all(dir.join("dest")).expect("dest");
        fs::write(dir.join("src/.env"), "SECRET=copied\n").expect("source");
        fs::write(dir.join("dest/.env.local"), "keep\n").expect("existing dest");
        let candidates = vec![
            LocalFileCandidate {
                path: ".env".into(),
                size_bytes: 14,
            },
            LocalFileCandidate {
                path: ".env.local".into(),
                size_bytes: 5,
            },
        ];

        let result = copy_environment_files(&dir.join("src"), &dir.join("dest"), &candidates);
        assert_eq!(result.copied, vec![".env".to_owned()]);
        assert_eq!(result.failures.len(), 1);
        assert_eq!(result.failures[0].path, ".env.local");
        assert_eq!(
            result.failures[0].error.message,
            "destination already exists"
        );
        assert_eq!(
            fs::read_to_string(dir.join("dest/.env")).expect("copied"),
            "SECRET=copied\n"
        );
        assert_eq!(
            fs::read_to_string(dir.join("dest/.env.local")).expect("kept"),
            "keep\n"
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn copy_rejects_symlink_and_path_escape() {
        let dir = std::env::temp_dir().join(format!("git-forest-reject-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(dir.join("src")).expect("src");
        fs::create_dir_all(dir.join("dest")).expect("dest");
        std::os::unix::fs::symlink("/tmp/secret", dir.join("src/.env")).expect("symlink");

        let result = copy_environment_files(
            &dir.join("src"),
            &dir.join("dest"),
            &[
                LocalFileCandidate {
                    path: ".env".into(),
                    size_bytes: 1,
                },
                LocalFileCandidate {
                    path: "../.env".into(),
                    size_bytes: 1,
                },
                LocalFileCandidate {
                    path: "/tmp/.env".into(),
                    size_bytes: 1,
                },
            ],
        );
        assert!(result.copied.is_empty());
        assert_eq!(result.failures.len(), 3);
        assert_eq!(
            result.failures[0].error.message,
            "source is not a regular file"
        );
        assert_eq!(
            result.failures[1].error.message,
            "path is not a root-relative file name"
        );
        assert_eq!(
            result.failures[2].error.message,
            "path is not a root-relative file name"
        );
        assert!(!dir.join("dest/.env").exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn unreadable_source_is_a_structured_failure() {
        let dir = std::env::temp_dir().join(format!("git-forest-perm-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(dir.join("src")).expect("src");
        fs::create_dir_all(dir.join("dest")).expect("dest");
        let source = dir.join("src/.env");
        fs::write(&source, "SECRET=hidden\n").expect("write");
        fs::set_permissions(&source, fs::Permissions::from_mode(0o000)).expect("chmod");

        let result = copy_environment_files(
            &dir.join("src"),
            &dir.join("dest"),
            &[LocalFileCandidate {
                path: ".env".into(),
                size_bytes: 14,
            }],
        );
        fs::set_permissions(&source, fs::Permissions::from_mode(0o644)).expect("restore");
        assert!(result.copied.is_empty());
        assert_eq!(result.failures.len(), 1);
        assert_eq!(result.failures[0].path, ".env");
        assert!(!dir.join("dest/.env").exists());
        let _ = fs::remove_dir_all(&dir);
    }
}
