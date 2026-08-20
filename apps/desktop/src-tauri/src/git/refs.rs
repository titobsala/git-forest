use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::domain::ForestError;

use super::runner::GitRunner;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalBranch {
    pub name: String,
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

#[cfg(test)]
mod tests {
    use super::{branch_exists, list_local_branches, resolve_commit, validate_branch_name};
    use crate::domain::ForestError;
    use crate::git::runner::GitRunner;
    use crate::git::testing::{run_git, TempGit};

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
}
