use std::path::{Path, PathBuf};

use crate::domain::ForestError;

#[cfg(target_os = "linux")]
mod linux;

#[cfg(target_os = "linux")]
pub use linux::LinuxProcInspector;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProcessIdentity {
    pub pid: i32,
    pub start_ticks: u64,
    pub cwd: PathBuf,
    pub command: String,
    pub cmdline: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProcessExpectation {
    pub worktree_path: PathBuf,
    pub agent_command: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProcessInspect {
    Missing,
    Inaccessible,
    Present(ProcessIdentity),
}

pub trait ProcessInspector: Send + Sync {
    fn snapshot_matching(
        &self,
        expected: &ProcessExpectation,
    ) -> Result<Vec<ProcessIdentity>, ForestError>;

    fn inspect_pid(&self, pid: i32) -> Result<ProcessInspect, ForestError>;
}

pub fn default_process_inspector() -> Box<dyn ProcessInspector> {
    #[cfg(target_os = "linux")]
    {
        Box::new(LinuxProcInspector)
    }
    #[cfg(not(target_os = "linux"))]
    {
        Box::new(UnsupportedProcessInspector)
    }
}

#[cfg(not(target_os = "linux"))]
pub struct UnsupportedProcessInspector;

#[cfg(not(target_os = "linux"))]
impl ProcessInspector for UnsupportedProcessInspector {
    fn snapshot_matching(
        &self,
        _expected: &ProcessExpectation,
    ) -> Result<Vec<ProcessIdentity>, ForestError> {
        Ok(Vec::new())
    }

    fn inspect_pid(&self, _pid: i32) -> Result<ProcessInspect, ForestError> {
        Ok(ProcessInspect::Inaccessible)
    }
}

pub fn basename(path: &str) -> &str {
    Path::new(path)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(path)
}

pub fn command_matches(identity: &ProcessIdentity, expected_command: &str) -> bool {
    let expected = basename(expected_command);
    basename(&identity.command) == expected
        || identity
            .cmdline
            .iter()
            .any(|token| basename(token) == expected)
}

pub fn cwd_matches(identity: &ProcessIdentity, worktree_path: &Path) -> bool {
    canonicalize_or_clone(&identity.cwd) == canonicalize_or_clone(worktree_path)
}

pub fn identity_key(identity: &ProcessIdentity) -> (i32, u64) {
    (identity.pid, identity.start_ticks)
}

pub fn newest_unseen(
    candidates: Vec<ProcessIdentity>,
    baseline: &[(i32, u64)],
) -> Option<ProcessIdentity> {
    let mut matches: Vec<_> = candidates
        .into_iter()
        .filter(|identity| !baseline.contains(&identity_key(identity)))
        .collect();
    matches.sort_by_key(|identity| identity.start_ticks);
    matches.pop()
}

/// Field 22 (`starttime`) lives after `comm`, which is wrapped in parentheses
/// and may itself contain spaces or `)`.
pub fn parse_start_ticks(stat: &str) -> Option<u64> {
    let close = stat.rfind(')')?;
    let rest = stat[close + 1..].trim_start();
    rest.split_whitespace().nth(19)?.parse().ok()
}

pub fn parse_cmdline(bytes: &[u8]) -> Vec<String> {
    bytes
        .split(|byte| *byte == 0)
        .filter(|token| !token.is_empty())
        .map(|token| String::from_utf8_lossy(token).into_owned())
        .collect()
}

fn canonicalize_or_clone(path: &Path) -> PathBuf {
    path.canonicalize().unwrap_or_else(|_| path.to_path_buf())
}

#[cfg(test)]
pub(crate) mod fake {
    use super::{
        command_matches, cwd_matches, ProcessExpectation, ProcessIdentity, ProcessInspect,
        ProcessInspector,
    };
    use crate::domain::ForestError;
    use std::sync::{Arc, Mutex};

    #[derive(Clone, Default)]
    pub struct FakeProcessInspector {
        inner: Arc<Mutex<FakeState>>,
    }

    #[derive(Default)]
    struct FakeState {
        snapshots: u32,
        live: Vec<ProcessIdentity>,
        pending: Vec<ProcessIdentity>,
        inaccessible: Vec<i32>,
    }

    impl FakeProcessInspector {
        pub fn new() -> Self {
            Self::default()
        }

        pub fn add_live(&self, identity: ProcessIdentity) {
            self.inner.lock().expect("lock").live.push(identity);
        }

        pub fn appear_after_baseline(&self, identity: ProcessIdentity) {
            self.inner.lock().expect("lock").pending.push(identity);
        }

        pub fn mark_inaccessible(&self, pid: i32) {
            self.inner.lock().expect("lock").inaccessible.push(pid);
        }
    }

    impl ProcessInspector for FakeProcessInspector {
        fn snapshot_matching(
            &self,
            expected: &ProcessExpectation,
        ) -> Result<Vec<ProcessIdentity>, ForestError> {
            let mut state = self.inner.lock().expect("lock");
            state.snapshots += 1;
            if state.snapshots > 1 {
                let mut pending = std::mem::take(&mut state.pending);
                state.live.append(&mut pending);
            }
            Ok(state
                .live
                .iter()
                .filter(|identity| {
                    cwd_matches(identity, &expected.worktree_path)
                        && command_matches(identity, &expected.agent_command)
                })
                .cloned()
                .collect())
        }

        fn inspect_pid(&self, pid: i32) -> Result<ProcessInspect, ForestError> {
            let state = self.inner.lock().expect("lock");
            if state.inaccessible.contains(&pid) {
                return Ok(ProcessInspect::Inaccessible);
            }
            Ok(state
                .live
                .iter()
                .find(|identity| identity.pid == pid)
                .cloned()
                .map(ProcessInspect::Present)
                .unwrap_or(ProcessInspect::Missing))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{
        command_matches, cwd_matches, newest_unseen, parse_cmdline, parse_start_ticks,
        ProcessIdentity,
    };
    use std::path::PathBuf;

    fn identity(pid: i32, ticks: u64, command: &str, cmdline: &[&str]) -> ProcessIdentity {
        ProcessIdentity {
            pid,
            start_ticks: ticks,
            cwd: PathBuf::from("/tmp/wt"),
            command: command.to_owned(),
            cmdline: cmdline.iter().map(|token| (*token).to_owned()).collect(),
        }
    }

    #[test]
    fn parses_start_ticks_after_a_comm_with_spaces_and_parentheses() {
        let mut fields = vec!["S".to_owned()];
        fields.extend((0..18).map(|index| index.to_string()));
        fields.push("98765".to_owned());
        let stat = format!("4242 (warp-terminal (beta)) {}", fields.join(" "));
        assert_eq!(parse_start_ticks(&stat), Some(98765));
    }

    #[test]
    fn parses_nul_separated_cmdline() {
        assert_eq!(
            parse_cmdline(b"bash\0/usr/local/bin/codex\0--search\0"),
            vec!["bash", "/usr/local/bin/codex", "--search"]
        );
    }

    #[test]
    fn matches_wrapper_script_tokens_and_exe_basename() {
        let wrapped = identity(1, 1, "bash", &["bash", "/usr/local/bin/codex"]);
        assert!(command_matches(&wrapped, "codex"));
        let direct = identity(2, 1, "/usr/bin/codex", &["/usr/bin/codex"]);
        assert!(command_matches(&direct, "codex"));
        let other = identity(3, 1, "claude", &["claude"]);
        assert!(!command_matches(&other, "codex"));
    }

    #[test]
    fn cwd_matches_uses_canonical_paths() {
        let identity = ProcessIdentity {
            pid: 1,
            start_ticks: 1,
            cwd: PathBuf::from("/tmp"),
            command: "codex".into(),
            cmdline: vec!["codex".into()],
        };
        assert!(cwd_matches(&identity, PathBuf::from("/tmp").as_path()));
        assert!(!cwd_matches(
            &identity,
            PathBuf::from("/tmp/does-not-exist-cwd-match").as_path()
        ));
    }

    #[test]
    fn newest_unseen_skips_baseline_and_prefers_later_start_ticks() {
        let older = identity(10, 100, "codex", &["codex"]);
        let newer = identity(11, 200, "codex", &["codex"]);
        let chosen = newest_unseen(vec![older.clone(), newer.clone()], &[(10, 100)]);
        assert_eq!(chosen.as_ref().map(|item| item.pid), Some(11));
        assert!(newest_unseen(vec![older], &[(10, 100)]).is_none());
    }
}
