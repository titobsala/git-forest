use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime};

use crate::agents::encode_command_line;
use crate::domain::{
    AgentLaunchSpec, ForestError, LaunchBehavior, TerminalLaunchResult, TerminalProviderId,
};

use super::launcher::{DesktopLauncher, SystemDesktopLauncher};
use super::provider::TerminalProvider;

const AVAILABILITY_TTL: Duration = Duration::from_secs(30);
const TAB_CONFIG_TTL: Duration = Duration::from_secs(60);
const WARP_BINARIES: &[&str] = &["warp-terminal", "warp"];
const WARP_SCHEME: &str = "warp";
const TAB_CONFIG_PREFIX: &str = "git-forest-";

pub struct WarpProvider {
    launcher: Box<dyn DesktopLauncher>,
    cache: Mutex<AvailabilityCache>,
    tab_config_dir: PathBuf,
    tab_config_ttl: Duration,
}

struct AvailabilityCache {
    ttl: Duration,
    last: Option<(Instant, bool)>,
}

impl WarpProvider {
    pub fn system(home_dir: &Path) -> Self {
        Self::new(
            Box::new(SystemDesktopLauncher),
            AVAILABILITY_TTL,
            warp_tab_config_dir(home_dir),
        )
    }

    pub fn new(launcher: Box<dyn DesktopLauncher>, ttl: Duration, tab_config_dir: PathBuf) -> Self {
        Self::new_with_tab_ttl(launcher, ttl, tab_config_dir, TAB_CONFIG_TTL)
    }

    pub fn new_with_tab_ttl(
        launcher: Box<dyn DesktopLauncher>,
        ttl: Duration,
        tab_config_dir: PathBuf,
        tab_config_ttl: Duration,
    ) -> Self {
        Self {
            launcher,
            cache: Mutex::new(AvailabilityCache { ttl, last: None }),
            tab_config_dir,
            tab_config_ttl,
        }
    }

    /// Warp is only usable when it is installed *and* the launcher can hand a
    /// `warp://` URI to the desktop. Every launch goes through the URI opener,
    /// so reporting an installed Warp as available without it would turn a
    /// detectable gap into a failure at launch time.
    fn detect(&self) -> bool {
        let installed = WARP_BINARIES
            .iter()
            .any(|binary| self.launcher.executable_on_path(binary))
            || self.launcher.uri_scheme_registered(WARP_SCHEME);
        installed && self.launcher.can_open_uris()
    }

    fn prune_tab_configs(&self) -> Result<(), ForestError> {
        let entries = match std::fs::read_dir(&self.tab_config_dir) {
            Ok(entries) => entries,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
            Err(error) => return Err(error.into()),
        };
        let now = SystemTime::now();
        for entry in entries.flatten() {
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if !name.starts_with(TAB_CONFIG_PREFIX) || !name.ends_with(".toml") {
                continue;
            }
            let stale = match entry
                .metadata()
                .ok()
                .and_then(|metadata| metadata.modified().ok())
            {
                Some(modified) => now
                    .duration_since(modified)
                    .map(|age| age >= self.tab_config_ttl)
                    .unwrap_or(true),
                None => true,
            };
            if stale {
                let _ = std::fs::remove_file(entry.path());
            }
        }
        Ok(())
    }
}

impl TerminalProvider for WarpProvider {
    fn id(&self) -> TerminalProviderId {
        TerminalProviderId::Warp
    }

    fn is_available(&self) -> Result<bool, ForestError> {
        let mut cache = self.cache.lock().map_err(|_| ForestError::MutexPoisoned)?;
        if let Some((checked_at, value)) = cache.last {
            if checked_at.elapsed() < cache.ttl {
                return Ok(value);
            }
        }
        let value = self.detect();
        cache.last = Some((Instant::now(), value));
        Ok(value)
    }

    fn open_directory(
        &self,
        path: &Path,
        behavior: LaunchBehavior,
    ) -> Result<TerminalLaunchResult, ForestError> {
        if !self.is_available()? {
            return Err(ForestError::TerminalUnavailable("Warp".to_owned()));
        }
        if !path.is_dir() {
            return Err(ForestError::WorktreeMissing);
        }
        self.launcher
            .open_uri(&warp_directory_uri(path, behavior))?;
        Ok(TerminalLaunchResult {
            provider: TerminalProviderId::Warp,
        })
    }

    fn launch_command(
        &self,
        spec: &AgentLaunchSpec,
        behavior: LaunchBehavior,
    ) -> Result<TerminalLaunchResult, ForestError> {
        if !self.is_available()? {
            return Err(ForestError::TerminalUnavailable("Warp".to_owned()));
        }
        if !spec.working_directory.is_dir() {
            return Err(ForestError::WorktreeMissing);
        }
        self.prune_tab_configs()?;
        std::fs::create_dir_all(&self.tab_config_dir)?;
        let stem = format!("{TAB_CONFIG_PREFIX}{}", uuid::Uuid::new_v4());
        let path = self.tab_config_dir.join(format!("{stem}.toml"));
        let command_line = encode_command_line(&spec.command, &spec.args)?;
        std::fs::write(
            &path,
            render_tab_config(&spec.display_name, &spec.working_directory, &command_line)?,
        )?;
        let uri = warp_tab_config_uri(&stem, behavior);
        if let Err(error) = self.launcher.open_uri(&uri) {
            let _ = std::fs::remove_file(&path);
            return Err(error);
        }
        Ok(TerminalLaunchResult {
            provider: TerminalProviderId::Warp,
        })
    }
}

pub(crate) fn warp_directory_uri(path: &Path, behavior: LaunchBehavior) -> String {
    let action = match behavior {
        LaunchBehavior::Window => "new_window",
        LaunchBehavior::Auto | LaunchBehavior::Tab => "new_tab",
    };
    let encoded = percent_encode_path(&path.to_string_lossy());
    format!("warp://action/{action}?path={encoded}")
}

fn warp_tab_config_uri(stem: &str, behavior: LaunchBehavior) -> String {
    match behavior {
        LaunchBehavior::Window => format!("warp://tab_config/{stem}?new_window=true"),
        LaunchBehavior::Auto | LaunchBehavior::Tab => format!("warp://tab_config/{stem}"),
    }
}

fn warp_tab_config_dir(home_dir: &Path) -> PathBuf {
    match std::env::var_os("XDG_DATA_HOME") {
        Some(value) if !value.is_empty() => PathBuf::from(value).join("warp-terminal/tab_configs"),
        _ => home_dir.join(".local/share/warp-terminal/tab_configs"),
    }
}

fn render_tab_config(
    display_name: &str,
    directory: &Path,
    command_line: &str,
) -> Result<String, ForestError> {
    let directory = directory
        .to_str()
        .ok_or(ForestError::WorktreePathUnavailable)?;
    Ok(format!(
        "name = {}\n[[panes]]\nid = \"main\"\ntype = \"terminal\"\ndirectory = {}\ncommands = [{}]\n",
        toml_string(&format!("Git Forest · {display_name}")),
        toml_string(directory),
        toml_string(command_line),
    ))
}

/// Render a TOML basic string.
///
/// Paths and display names come from outside the app, so every character TOML
/// forbids inside a basic string — the C0 control range and `DEL` — has to be
/// escaped, not just the three common ones. An unescaped carriage return in a
/// worktree path would otherwise emit a tab config Warp cannot parse while the
/// URI dispatch still reports success.
fn toml_string(value: &str) -> String {
    let mut rendered = String::with_capacity(value.len() + 2);
    rendered.push('"');
    for character in value.chars() {
        match character {
            '\\' => rendered.push_str("\\\\"),
            '"' => rendered.push_str("\\\""),
            '\u{8}' => rendered.push_str("\\b"),
            '\t' => rendered.push_str("\\t"),
            '\n' => rendered.push_str("\\n"),
            '\u{c}' => rendered.push_str("\\f"),
            '\r' => rendered.push_str("\\r"),
            character if character < '\u{20}' || character == '\u{7f}' => {
                rendered.push_str(&format!("\\u{:04X}", character as u32));
            }
            character => rendered.push(character),
        }
    }
    rendered.push('"');
    rendered
}

fn percent_encode_path(value: &str) -> String {
    let mut encoded = String::new();
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' | b'/' => {
                encoded.push(char::from(byte))
            }
            _ => encoded.push_str(&format!("%{byte:02X}")),
        }
    }
    encoded
}

#[cfg(test)]
mod tests {
    use super::{toml_string, warp_directory_uri, WarpProvider};
    use crate::domain::{AgentLaunchSpec, ForestError, LaunchBehavior};
    use crate::terminals::launcher::FakeDesktopLauncher;
    use crate::terminals::provider::TerminalProvider;
    use std::fs;
    use std::path::PathBuf;
    use std::time::Duration;

    fn available_provider(launcher: FakeDesktopLauncher, tab_config_dir: PathBuf) -> WarpProvider {
        WarpProvider::new(Box::new(launcher), Duration::from_secs(30), tab_config_dir)
    }

    fn spec(worktree: &std::path::Path, command: &str) -> AgentLaunchSpec {
        AgentLaunchSpec {
            working_directory: worktree.to_path_buf(),
            command: command.into(),
            args: Vec::new(),
            display_name: command.into(),
        }
    }

    #[test]
    fn auto_and_tab_open_a_new_tab_uri_with_encoded_path() {
        assert_eq!(
            warp_directory_uri(
                std::path::Path::new("/tmp/my worktree"),
                LaunchBehavior::Auto
            ),
            "warp://action/new_tab?path=/tmp/my%20worktree"
        );
        assert_eq!(
            warp_directory_uri(std::path::Path::new("/tmp/app"), LaunchBehavior::Tab),
            "warp://action/new_tab?path=/tmp/app"
        );
        assert_eq!(
            warp_directory_uri(std::path::Path::new("/tmp/app"), LaunchBehavior::Window),
            "warp://action/new_window?path=/tmp/app"
        );
    }

    #[test]
    fn detects_warp_from_a_path_binary_or_registered_uri_handler() {
        let env = crate::git::testing::TempGit::new();
        let from_binary = available_provider(
            FakeDesktopLauncher::with_binary("warp-terminal"),
            env.path("tabs"),
        );
        assert!(from_binary.is_available().expect("binary"));

        let from_alias =
            available_provider(FakeDesktopLauncher::with_binary("warp"), env.path("tabs"));
        assert!(from_alias.is_available().expect("alias"));

        let from_scheme =
            available_provider(FakeDesktopLauncher::with_scheme("warp"), env.path("tabs"));
        assert!(from_scheme.is_available().expect("scheme"));

        let missing = available_provider(FakeDesktopLauncher::default(), env.path("tabs"));
        assert!(!missing.is_available().expect("missing"));
    }

    #[test]
    fn an_installed_warp_without_a_uri_opener_is_unavailable() {
        let env = crate::git::testing::TempGit::new();
        let provider = available_provider(
            FakeDesktopLauncher::with_binary("warp-terminal").without_uri_opener(),
            env.path("tabs"),
        );
        assert!(!provider.is_available().expect("no opener"));

        let error = provider
            .open_directory(env.root(), LaunchBehavior::Auto)
            .expect_err("unavailable");
        assert!(matches!(
            error,
            ForestError::TerminalUnavailable(ref name) if name == "Warp"
        ));
    }

    #[test]
    fn toml_strings_escape_every_control_character() {
        assert_eq!(toml_string("plain"), "\"plain\"");
        assert_eq!(
            toml_string("/tmp/we\rird\u{8}\u{c}\ttab\nline\"quoted\"\\back"),
            "\"/tmp/we\\rird\\b\\f\\ttab\\nline\\\"quoted\\\"\\\\back\""
        );
        assert_eq!(
            toml_string("bell\u{7}del\u{7f}"),
            "\"bell\\u0007del\\u007F\""
        );
    }

    #[test]
    fn caches_availability_within_the_ttl() {
        let env = crate::git::testing::TempGit::new();
        let launcher = FakeDesktopLauncher::with_binary("warp-terminal");
        let provider = available_provider(launcher.clone(), env.path("tabs"));

        assert!(provider.is_available().expect("first"));
        assert!(provider.is_available().expect("second"));
        assert_eq!(launcher.path_check_count(), 1);
    }

    #[test]
    fn zero_ttl_rechecks_availability_on_every_call() {
        let env = crate::git::testing::TempGit::new();
        let launcher = FakeDesktopLauncher::with_binary("warp-terminal");
        let provider =
            WarpProvider::new(Box::new(launcher.clone()), Duration::ZERO, env.path("tabs"));

        assert!(provider.is_available().expect("first"));
        assert!(provider.is_available().expect("second"));
        assert_eq!(launcher.path_check_count(), 2);
    }

    #[test]
    fn opens_an_existing_directory_through_the_uri_launcher() {
        let env = crate::git::testing::TempGit::new();
        let launcher = FakeDesktopLauncher::with_binary("warp-terminal");
        let provider = available_provider(launcher.clone(), env.path("tabs"));

        let result = provider
            .open_directory(env.root(), LaunchBehavior::Auto)
            .expect("open");
        assert_eq!(result.provider, crate::domain::TerminalProviderId::Warp);
        assert_eq!(
            launcher.opened(),
            vec![warp_directory_uri(env.root(), LaunchBehavior::Auto)]
        );
    }

    #[test]
    fn missing_warp_is_a_terminal_unavailable_error() {
        let env = crate::git::testing::TempGit::new();
        let provider = available_provider(FakeDesktopLauncher::default(), env.path("tabs"));
        let error = provider
            .open_directory(env.root(), LaunchBehavior::Auto)
            .expect_err("unavailable");
        assert!(matches!(
            error,
            ForestError::TerminalUnavailable(ref name) if name == "Warp"
        ));
        assert_eq!(
            crate::domain::CommandError::from(error).code,
            "terminal_unavailable"
        );
    }

    #[test]
    fn launch_failures_are_surfaced() {
        let env = crate::git::testing::TempGit::new();
        let launcher = FakeDesktopLauncher::with_binary("warp-terminal").fail_open("cannot open");
        let provider = available_provider(launcher, env.path("tabs"));
        let error = provider
            .open_directory(env.root(), LaunchBehavior::Window)
            .expect_err("failed");
        assert!(
            matches!(error, ForestError::TerminalLaunchFailed(ref message) if message == "cannot open")
        );
    }

    #[test]
    fn launch_command_writes_a_prefixed_tab_config_and_opens_it() {
        let env = crate::git::testing::TempGit::new();
        let tabs = env.path("tabs");
        let launcher = FakeDesktopLauncher::with_binary("warp-terminal");
        let provider = available_provider(launcher.clone(), tabs.clone());

        provider
            .launch_command(&spec(env.root(), "codex"), LaunchBehavior::Auto)
            .expect("launch");

        let opened = launcher.opened();
        assert_eq!(opened.len(), 1);
        assert!(opened[0].starts_with("warp://tab_config/git-forest-"));
        assert!(!opened[0].contains("new_window"));

        let files: Vec<_> = fs::read_dir(&tabs)
            .expect("tabs")
            .map(|entry| {
                entry
                    .expect("entry")
                    .file_name()
                    .to_string_lossy()
                    .into_owned()
            })
            .collect();
        assert_eq!(files.len(), 1);
        assert!(files[0].starts_with("git-forest-"));
        assert!(files[0].ends_with(".toml"));
        let body = fs::read_to_string(tabs.join(&files[0])).expect("read");
        assert!(body.contains(&format!("directory = \"{}\"", env.root().display())));
        assert!(body.contains("commands = [\"codex\"]"));
        assert!(!body.contains(&format!("commands = [\"codex {}\"]", env.root().display())));
    }

    #[test]
    fn window_behavior_opens_a_tab_config_in_a_new_window() {
        let env = crate::git::testing::TempGit::new();
        let launcher = FakeDesktopLauncher::with_binary("warp-terminal");
        let provider = available_provider(launcher.clone(), env.path("tabs"));
        provider
            .launch_command(&spec(env.root(), "claude"), LaunchBehavior::Window)
            .expect("launch");
        assert!(launcher.opened()[0].ends_with("?new_window=true"));
    }

    #[test]
    fn prunes_stale_generated_tab_configs_and_leaves_other_files() {
        let env = crate::git::testing::TempGit::new();
        let tabs = env.path("tabs");
        fs::create_dir_all(&tabs).expect("tabs");
        fs::write(tabs.join("git-forest-old.toml"), "stale\n").expect("stale");
        fs::write(tabs.join("my-user-tab.toml"), "keep\n").expect("user");
        let launcher = FakeDesktopLauncher::with_binary("warp-terminal");
        let provider = WarpProvider::new_with_tab_ttl(
            Box::new(launcher),
            Duration::from_secs(30),
            tabs.clone(),
            Duration::ZERO,
        );

        provider
            .launch_command(&spec(env.root(), "opencode"), LaunchBehavior::Tab)
            .expect("launch");

        let names: Vec<_> = fs::read_dir(&tabs)
            .expect("tabs")
            .map(|entry| {
                entry
                    .expect("entry")
                    .file_name()
                    .to_string_lossy()
                    .into_owned()
            })
            .collect();
        assert!(names.contains(&"my-user-tab.toml".to_owned()));
        assert!(!names.contains(&"git-forest-old.toml".to_owned()));
        assert!(names
            .iter()
            .any(|name| name.starts_with("git-forest-") && name != "git-forest-old.toml"));
    }

    #[test]
    fn failed_agent_launch_does_not_leave_a_tab_config() {
        let env = crate::git::testing::TempGit::new();
        let tabs = env.path("tabs");
        let launcher = FakeDesktopLauncher::with_binary("warp-terminal").fail_open("no warp");
        let provider = available_provider(launcher, tabs.clone());
        provider
            .launch_command(&spec(env.root(), "codex"), LaunchBehavior::Auto)
            .expect_err("failed");
        assert!(!tabs.exists() || fs::read_dir(&tabs).expect("tabs").next().is_none());
    }
}
