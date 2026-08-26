use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::domain::ForestError;

use super::runner::GitRunner;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalBranch {
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteBranch {
    pub remote: String,
    pub name: String,
    pub reference: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BranchCatalog {
    pub local_branches: Vec<LocalBranch>,
    pub remote_branches: Vec<RemoteBranch>,
}

pub fn list_local_branches(git: &GitRunner, repo: &Path) -> Result<Vec<LocalBranch>, ForestError> {
    let output = git.run_success(
        repo,
        &["for-each-ref", "--format=%(refname:short)", "refs/heads"],
    )?;
    let mut branches = output
        .stdout_text()
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(|name| LocalBranch {
            name: name.to_owned(),
        })
        .collect::<Vec<_>>();
    branches.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(branches)
}

pub fn list_branch_catalog(git: &GitRunner, repo: &Path) -> Result<BranchCatalog, ForestError> {
    Ok(BranchCatalog {
        local_branches: list_local_branches(git, repo)?,
        remote_branches: list_remote_branches(git, repo)?,
    })
}

pub fn fetch_branch_catalog(git: &GitRunner, repo: &Path) -> Result<BranchCatalog, ForestError> {
    git.run_success(
        repo,
        &["fetch", "--all", "--prune", "--no-recurse-submodules"],
    )?;
    list_branch_catalog(git, repo)
}

pub fn is_remote_tracking_base(
    git: &GitRunner,
    repo: &Path,
    reference: &str,
) -> Result<bool, ForestError> {
    let catalog = list_branch_catalog(git, repo)?;
    Ok(catalog
        .remote_branches
        .iter()
        .any(|branch| branch.reference == reference))
}

pub fn branch_exists(git: &GitRunner, repo: &Path, branch: &str) -> Result<bool, ForestError> {
    let output = git.run(
        repo,
        &[
            "show-ref",
            "--verify",
            "--quiet",
            &format!("refs/heads/{branch}"),
        ],
    )?;
    if output.success {
        return Ok(true);
    }
    if output
        .stderr
        .to_ascii_lowercase()
        .contains("not a git repository")
    {
        return Err(ForestError::InvalidRepository);
    }
    Ok(false)
}

pub fn validate_branch_name(git: &GitRunner, repo: &Path, branch: &str) -> Result<(), ForestError> {
    git.run_success(repo, &["check-ref-format", "--branch", branch])
        .map(|_| ())
        .map_err(|error| match error {
            ForestError::GitCommandFailed(_) | ForestError::InvalidBranchName(_) => {
                ForestError::InvalidBranchName(branch.to_owned())
            }
            other => other,
        })
}

pub fn resolve_commit(
    git: &GitRunner,
    repo: &Path,
    reference: &str,
) -> Result<String, ForestError> {
    let spec = format!("{reference}^{{commit}}");
    let output = git.run(repo, &["rev-parse", "--verify", "--end-of-options", &spec])?;
    if output.success {
        return Ok(output.stdout_trim());
    }
    Err(ForestError::MissingRef(reference.to_owned()))
}

fn list_remote_branches(git: &GitRunner, repo: &Path) -> Result<Vec<RemoteBranch>, ForestError> {
    let remotes = list_configured_remotes(git, repo)?;
    if remotes.is_empty() {
        return Ok(Vec::new());
    }

    let output = git.run_success(
        repo,
        &[
            "for-each-ref",
            "--format=%(refname)%00%(symref)",
            "refs/remotes",
        ],
    )?;
    let mut branches = Vec::new();
    for record in output.stdout_text().lines() {
        let record = record.trim();
        if record.is_empty() {
            continue;
        }
        let mut fields = record.split('\0');
        let Some(reference) = fields
            .next()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        else {
            continue;
        };
        let symbolic = fields.next().unwrap_or("").trim();
        if !symbolic.is_empty() {
            continue;
        }
        let Some((remote, name)) = classify_remote_ref(reference, &remotes) else {
            continue;
        };
        branches.push(RemoteBranch {
            remote,
            name,
            reference: reference.to_owned(),
        });
    }
    branches.sort_by(|left, right| {
        left.remote
            .cmp(&right.remote)
            .then(left.name.cmp(&right.name))
            .then(left.reference.cmp(&right.reference))
    });
    Ok(branches)
}

fn list_configured_remotes(git: &GitRunner, repo: &Path) -> Result<Vec<String>, ForestError> {
    let output = git.run_success(repo, &["remote"])?;
    Ok(output
        .stdout_text()
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(ToOwned::to_owned)
        .collect())
}

fn classify_remote_ref(reference: &str, remotes: &[String]) -> Option<(String, String)> {
    let rest = reference.strip_prefix("refs/remotes/")?;
    remotes
        .iter()
        .filter_map(|remote| {
            rest.strip_prefix(remote.as_str())
                .and_then(|tail| tail.strip_prefix('/'))
                .filter(|name| !name.is_empty() && *name != "HEAD")
                .map(|name| (remote.clone(), name.to_owned()))
        })
        .max_by_key(|(remote, _)| remote.len())
}

#[cfg(test)]
mod tests {
    use super::{
        branch_exists, fetch_branch_catalog, is_remote_tracking_base, list_branch_catalog,
        list_local_branches, resolve_commit, validate_branch_name,
    };
    use crate::domain::ForestError;
    use crate::git::runner::GitRunner;
    use crate::git::testing::{run_git, TempGit};
    use std::path::{Path, PathBuf};

    #[test]
    fn lists_local_branches_in_sorted_order() {
        let env = TempGit::new();
        let repo = env.init_repo("app");
        env.commit_file(&repo, "README.md", "hello\n", "initial");
        run_git(&repo, &["branch", "feature"]);
        run_git(&repo, &["branch", "hotfix"]);

        let branches = list_local_branches(&GitRunner::new(), &repo).expect("branches");
        let names: Vec<_> = branches.into_iter().map(|branch| branch.name).collect();
        assert_eq!(names, vec!["feature", "hotfix", "main"]);
    }

    #[test]
    fn lists_sorted_local_and_cached_remote_branches() {
        let env = TempGit::new();
        let (repo, origin) = seeded_repo_with_origin(&env);
        run_git(&origin, &["branch", "feat/example"]);
        run_git(&origin, &["branch", "hotfix"]);
        run_git(&repo, &["branch", "local-only"]);
        run_git(&repo, &["fetch", "origin"]);
        env.set_origin_head(&repo, "main");

        let catalog = list_branch_catalog(&GitRunner::new(), &repo).expect("catalog");
        let locals: Vec<_> = catalog
            .local_branches
            .iter()
            .map(|branch| branch.name.as_str())
            .collect();
        assert_eq!(locals, vec!["local-only", "main"]);
        let remotes: Vec<_> = catalog
            .remote_branches
            .iter()
            .map(|branch| {
                (
                    branch.remote.as_str(),
                    branch.name.as_str(),
                    branch.reference.as_str(),
                )
            })
            .collect();
        assert_eq!(
            remotes,
            vec![
                ("origin", "feat/example", "refs/remotes/origin/feat/example"),
                ("origin", "hotfix", "refs/remotes/origin/hotfix"),
                ("origin", "main", "refs/remotes/origin/main"),
            ]
        );
        assert!(!catalog
            .remote_branches
            .iter()
            .any(|branch| branch.name == "HEAD" || branch.reference.ends_with("/HEAD")));
    }

    #[test]
    fn omits_symbolic_origin_head() {
        let env = TempGit::new();
        let (repo, _) = seeded_repo_with_origin(&env);
        run_git(&repo, &["fetch", "origin"]);
        env.set_origin_head(&repo, "main");

        let catalog = list_branch_catalog(&GitRunner::new(), &repo).expect("catalog");
        assert!(catalog
            .remote_branches
            .iter()
            .any(|branch| branch.reference == "refs/remotes/origin/main"));
        assert!(!catalog.remote_branches.iter().any(|branch| {
            branch.reference == "refs/remotes/origin/HEAD" || branch.name == "HEAD"
        }));
    }

    #[test]
    fn fetch_makes_a_newly_pushed_remote_branch_visible() {
        let env = TempGit::new();
        let (repo, origin) = seeded_repo_with_origin(&env);
        run_git(&repo, &["fetch", "origin"]);

        let catalog = list_branch_catalog(&GitRunner::new(), &repo).expect("before");
        assert!(!catalog
            .remote_branches
            .iter()
            .any(|branch| branch.name == "feat/pushed"));

        let pusher = clone_repo(&env, &origin, "pusher");
        run_git(&pusher, &["checkout", "-b", "feat/pushed"]);
        env.commit_file(&pusher, "extra.md", "from pusher\n", "push me");
        run_git(&pusher, &["push", "-u", "origin", "feat/pushed"]);

        let still_cached = list_branch_catalog(&GitRunner::new(), &repo).expect("still cached");
        assert!(!still_cached
            .remote_branches
            .iter()
            .any(|branch| branch.name == "feat/pushed"));

        let fetched = fetch_branch_catalog(&GitRunner::new(), &repo).expect("fetch");
        assert!(fetched.remote_branches.iter().any(|branch| {
            branch.remote == "origin"
                && branch.name == "feat/pushed"
                && branch.reference == "refs/remotes/origin/feat/pushed"
        }));
    }

    #[test]
    fn multiple_remotes_keep_distinct_identity() {
        let env = TempGit::new();
        let origin = env.init_repo("origin");
        env.commit_file(&origin, "README.md", "hello\n", "initial");
        run_git(&origin, &["branch", "feat/shared"]);

        let upstream = env.init_repo("upstream");
        env.commit_file(&upstream, "README.md", "hello\n", "initial");
        run_git(&upstream, &["branch", "feat/shared"]);
        run_git(&upstream, &["branch", "feat/upstream-only"]);

        let repo = env.init_repo("app");
        env.commit_file(&repo, "README.md", "hello\n", "initial");
        env.add_remote(&repo, origin.to_str().expect("utf-8 origin"));
        run_git(
            &repo,
            &[
                "remote",
                "add",
                "upstream",
                upstream.to_str().expect("utf-8 upstream"),
            ],
        );
        run_git(&repo, &["fetch", "--all"]);

        let catalog = list_branch_catalog(&GitRunner::new(), &repo).expect("catalog");
        let remotes: Vec<_> = catalog
            .remote_branches
            .iter()
            .map(|branch| {
                (
                    branch.remote.as_str(),
                    branch.name.as_str(),
                    branch.reference.as_str(),
                )
            })
            .collect();
        assert!(remotes.contains(&("origin", "feat/shared", "refs/remotes/origin/feat/shared")));
        assert!(remotes.contains(&(
            "upstream",
            "feat/shared",
            "refs/remotes/upstream/feat/shared"
        )));
        assert!(remotes.contains(&(
            "upstream",
            "feat/upstream-only",
            "refs/remotes/upstream/feat/upstream-only"
        )));
        assert!(!remotes
            .iter()
            .any(|(remote, name, _)| *remote == "origin" && *name == "feat/upstream-only"));
    }

    #[test]
    fn only_exact_cached_remote_refs_classify_as_tracking_bases() {
        let env = TempGit::new();
        let (repo, origin) = seeded_repo_with_origin(&env);
        run_git(&origin, &["branch", "feat/example"]);
        run_git(&repo, &["fetch", "origin"]);
        let git = GitRunner::new();
        let sha = resolve_commit(&git, &repo, "refs/remotes/origin/feat/example").expect("sha");

        assert!(
            is_remote_tracking_base(&git, &repo, "refs/remotes/origin/feat/example")
                .expect("exact")
        );
        assert!(!is_remote_tracking_base(&git, &repo, "origin/feat/example").expect("short"));
        assert!(!is_remote_tracking_base(&git, &repo, "main").expect("local"));
        assert!(!is_remote_tracking_base(&git, &repo, &sha).expect("sha"));
        assert!(
            !is_remote_tracking_base(&git, &repo, "refs/remotes/origin/HEAD").expect("symbolic")
        );
    }

    #[test]
    fn failed_fetch_returns_a_structured_git_error() {
        let env = TempGit::new();
        let repo = env.init_repo("app");
        env.commit_file(&repo, "README.md", "hello\n", "initial");
        let missing = env.path("missing.git");
        env.add_remote(&repo, missing.to_str().expect("utf-8 missing"));

        let error = fetch_branch_catalog(&GitRunner::new(), &repo).expect_err("fetch");
        assert!(matches!(error, ForestError::GitCommandFailed(_)));
        let catalog = list_branch_catalog(&GitRunner::new(), &repo).expect("cached catalog");
        assert_eq!(
            catalog
                .local_branches
                .iter()
                .map(|branch| branch.name.as_str())
                .collect::<Vec<_>>(),
            vec!["main"]
        );
        assert!(catalog.remote_branches.is_empty());
    }

    #[test]
    fn validates_and_resolves_branch_references() {
        let env = TempGit::new();
        let repo = env.init_repo("app");
        env.commit_file(&repo, "README.md", "hello\n", "initial");
        let git = GitRunner::new();

        validate_branch_name(&git, &repo, "feat/ok").expect("valid");
        assert!(matches!(
            validate_branch_name(&git, &repo, "feat..bad").expect_err("invalid"),
            ForestError::InvalidBranchName(_)
        ));
        assert!(branch_exists(&git, &repo, "main").expect("exists"));
        assert!(!branch_exists(&git, &repo, "missing").expect("missing"));
        assert!(resolve_commit(&git, &repo, "main").expect("commit").len() >= 7);
        assert!(matches!(
            resolve_commit(&git, &repo, "no-such-ref").expect_err("missing"),
            ForestError::MissingRef(_)
        ));
    }

    fn seeded_repo_with_origin(env: &TempGit) -> (PathBuf, PathBuf) {
        let origin = env.init_repo("origin");
        env.commit_file(&origin, "README.md", "hello\n", "initial");
        let repo = env.init_repo("app");
        env.commit_file(&repo, "README.md", "hello\n", "initial");
        env.add_remote(&repo, origin.to_str().expect("utf-8 origin"));
        (repo, origin)
    }

    fn clone_repo(env: &TempGit, origin: &Path, name: &str) -> PathBuf {
        let path = env.path(name);
        run_git(
            env.root(),
            &[
                "clone",
                origin.to_str().expect("utf-8 origin"),
                path.to_str().expect("utf-8 clone"),
            ],
        );
        path
    }
}
