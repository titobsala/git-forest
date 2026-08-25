use std::fs;
use std::os::unix::ffi::OsStrExt;
use std::path::PathBuf;

use super::{
    basename, command_matches, cwd_matches, parse_cmdline, parse_start_ticks, ProcessExpectation,
    ProcessIdentity, ProcessInspect, ProcessInspector,
};
use crate::domain::ForestError;

pub struct LinuxProcInspector;

impl ProcessInspector for LinuxProcInspector {
    fn snapshot_matching(
        &self,
        expected: &ProcessExpectation,
    ) -> Result<Vec<ProcessIdentity>, ForestError> {
        let mut matches = Vec::new();
        let Ok(entries) = fs::read_dir("/proc") else {
            return Ok(matches);
        };
        for entry in entries.flatten() {
            let Some(pid) = parse_pid(&entry.file_name()) else {
                continue;
            };
            match inspect_linux_pid(pid)? {
                ProcessInspect::Present(identity)
                    if cwd_matches(&identity, &expected.worktree_path)
                        && command_matches(&identity, &expected.agent_command) =>
                {
                    matches.push(identity);
                }
                _ => {}
            }
        }
        Ok(matches)
    }

    fn inspect_pid(&self, pid: i32) -> Result<ProcessInspect, ForestError> {
        inspect_linux_pid(pid)
    }
}

fn parse_pid(name: &std::ffi::OsStr) -> Option<i32> {
    std::str::from_utf8(name.as_bytes()).ok()?.parse().ok()
}

fn inspect_linux_pid(pid: i32) -> Result<ProcessInspect, ForestError> {
    let dir = PathBuf::from(format!("/proc/{pid}"));
    if !dir.exists() {
        return Ok(ProcessInspect::Missing);
    }

    let stat = match fs::read_to_string(dir.join("stat")) {
        Ok(value) => value,
        Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => {
            return Ok(ProcessInspect::Inaccessible);
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(ProcessInspect::Missing);
        }
        Err(error) => return Err(error.into()),
    };
    let Some(start_ticks) = parse_start_ticks(&stat) else {
        return Ok(ProcessInspect::Inaccessible);
    };

    let cwd = match fs::read_link(dir.join("cwd")) {
        Ok(path) => path,
        Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => {
            return Ok(ProcessInspect::Inaccessible);
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(ProcessInspect::Missing);
        }
        Err(error) => return Err(error.into()),
    };

    let exe = fs::read_link(dir.join("exe")).ok();
    let cmdline = match fs::read(dir.join("cmdline")) {
        Ok(bytes) => parse_cmdline(&bytes),
        Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => {
            return Ok(ProcessInspect::Inaccessible);
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(ProcessInspect::Missing);
        }
        Err(error) => return Err(error.into()),
    };

    let command = exe
        .as_ref()
        .and_then(|path| path.file_name())
        .and_then(|name| name.to_str())
        .map(ToOwned::to_owned)
        .or_else(|| cmdline.first().map(|token| basename(token).to_owned()))
        .unwrap_or_default();

    Ok(ProcessInspect::Present(ProcessIdentity {
        pid,
        start_ticks,
        cwd,
        command,
        cmdline,
    }))
}

#[cfg(test)]
mod tests {
    use super::{parse_pid, LinuxProcInspector};
    use crate::processes::{parse_start_ticks, ProcessInspect, ProcessInspector};
    use std::ffi::OsStr;

    #[test]
    fn ignores_non_pid_proc_entries() {
        assert_eq!(parse_pid(OsStr::new("self")), None);
        assert_eq!(parse_pid(OsStr::new("4242")), Some(4242));
    }

    #[test]
    fn missing_proc_entry_is_missing() {
        let inspect = LinuxProcInspector.inspect_pid(i32::MAX).expect("inspect");
        assert_eq!(inspect, ProcessInspect::Missing);
    }

    #[test]
    fn parses_this_process_start_ticks() {
        let stat = std::fs::read_to_string("/proc/self/stat").expect("self stat");
        assert!(parse_start_ticks(&stat).is_some());
    }
}
