use std::path::Path;
use std::process::{Command, Stdio};
#[cfg(test)]
use std::sync::{Arc, Mutex};

use crate::domain::ForestError;

pub trait DesktopLauncher: Send + Sync {
    fn uri_scheme_registered(&self, scheme: &str) -> bool;
    fn open_uri(&self, uri: &str) -> Result<(), ForestError>;

    /// Whether this launcher can actually dispatch a URI right now.
    ///
    /// Availability checks call it so an installed terminal whose URI opener is
    /// missing is reported as unavailable instead of failing at launch.
    fn can_open_uris(&self) -> bool {
        true
    }
}

const URI_OPENER: &str = "xdg-open";

pub struct SystemDesktopLauncher;

impl SystemDesktopLauncher {
    pub(crate) fn build_open(uri: &str) -> Command {
        let mut command = Command::new(URI_OPENER);
        command
            .arg(uri)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::piped());
        command
    }
}

impl DesktopLauncher for SystemDesktopLauncher {
    fn can_open_uris(&self) -> bool {
        path_has_executable(URI_OPENER)
    }

    fn uri_scheme_registered(&self, scheme: &str) -> bool {
        let output = Command::new("xdg-mime")
            .args(["query", "default", &format!("x-scheme-handler/{scheme}")])
            .stdin(Stdio::null())
            .output();
        match output {
            Ok(output) if output.status.success() => {
                !String::from_utf8_lossy(&output.stdout).trim().is_empty()
            }
            _ => false,
        }
    }

    fn open_uri(&self, uri: &str) -> Result<(), ForestError> {
        let output = Self::build_open(uri)
            .output()
            .map_err(|error| ForestError::TerminalLaunchFailed(error.to_string()))?;
        if output.status.success() {
            return Ok(());
        }
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_owned();
        if stderr.is_empty() {
            Err(ForestError::TerminalLaunchFailed(
                "xdg-open failed to open Warp".to_owned(),
            ))
        } else {
            Err(ForestError::TerminalLaunchFailed(stderr))
        }
    }
}

fn is_executable(path: &Path) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        path.metadata()
            .map(|metadata| metadata.is_file() && metadata.permissions().mode() & 0o111 != 0)
            .unwrap_or(false)
    }
    #[cfg(not(unix))]
    {
        path.is_file()
    }
}

pub(crate) fn path_has_executable(name: &str) -> bool {
    let Some(path_var) = std::env::var_os("PATH") else {
        return false;
    };
    std::env::split_paths(&path_var).any(|dir| is_executable(&dir.join(name)))
}

#[cfg(test)]
#[derive(Clone, Default)]
pub struct FakeDesktopLauncher {
    inner: Arc<FakeInner>,
}

#[cfg(test)]
#[derive(Default)]
struct FakeInner {
    binaries: Mutex<Vec<String>>,
    schemes: Mutex<Vec<String>>,
    opened: Mutex<Vec<String>>,
    scheme_checks: Mutex<Vec<String>>,
    open_error: Mutex<Option<String>>,
    uri_opener_missing: Mutex<bool>,
}

#[cfg(test)]
impl FakeDesktopLauncher {
    pub fn with_binary(name: &str) -> Self {
        Self::with_binaries(&[name])
    }

    pub fn with_binaries(names: &[&str]) -> Self {
        let launcher = Self::default();
        launcher
            .inner
            .binaries
            .lock()
            .expect("binaries")
            .extend(names.iter().map(|name| (*name).to_owned()));
        launcher
    }

    pub fn with_scheme(scheme: &str) -> Self {
        Self::default().and_scheme(scheme)
    }

    pub fn and_scheme(self, scheme: &str) -> Self {
        self.inner
            .schemes
            .lock()
            .expect("schemes")
            .push(scheme.to_owned());
        self
    }

    /// Simulate a desktop with no URI opener installed.
    pub fn without_uri_opener(self) -> Self {
        *self.inner.uri_opener_missing.lock().expect("uri opener") = true;
        self
    }

    pub fn fail_open(self, message: &str) -> Self {
        *self.inner.open_error.lock().expect("open error") = Some(message.to_owned());
        self
    }

    pub fn opened(&self) -> Vec<String> {
        self.inner.opened.lock().expect("opened").clone()
    }

    pub fn scheme_check_count(&self) -> usize {
        self.inner
            .scheme_checks
            .lock()
            .expect("scheme checks")
            .len()
    }

    pub fn executable_on_path(&self, name: &str) -> bool {
        self.inner
            .binaries
            .lock()
            .expect("binaries")
            .iter()
            .any(|binary| binary == name)
    }
}

#[cfg(test)]
impl DesktopLauncher for FakeDesktopLauncher {
    fn uri_scheme_registered(&self, scheme: &str) -> bool {
        self.inner
            .scheme_checks
            .lock()
            .expect("scheme checks")
            .push(scheme.to_owned());
        self.inner
            .schemes
            .lock()
            .expect("schemes")
            .iter()
            .any(|registered| registered == scheme)
    }

    fn can_open_uris(&self) -> bool {
        !*self.inner.uri_opener_missing.lock().expect("uri opener")
    }

    fn open_uri(&self, uri: &str) -> Result<(), ForestError> {
        if let Some(message) = self.inner.open_error.lock().expect("open error").clone() {
            return Err(ForestError::TerminalLaunchFailed(message));
        }
        self.inner
            .opened
            .lock()
            .expect("opened")
            .push(uri.to_owned());
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::SystemDesktopLauncher;

    #[test]
    fn opens_a_uri_as_an_argument_array_not_a_shell_string() {
        let command =
            SystemDesktopLauncher::build_open("warp://action/new_tab?path=/tmp/my%20worktree");
        let rendered = format!("{command:?}");
        assert!(rendered.contains(super::URI_OPENER));
        assert!(rendered.contains("warp://action/new_tab?path=/tmp/my%20worktree"));
        assert!(!rendered.contains("sh -c"));
        assert!(!rendered.contains("bash -c"));
    }
}
