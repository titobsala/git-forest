use std::path::PathBuf;
use std::time::Duration;

use crate::agents::{ExecutableLocator, PathLocator};
use crate::domain::{
    AppInfo, ForestConfiguration, ForestError, ForestState, LaunchBehavior, Repository,
    TerminalProviderId, ThemePreference, WorktreeId, WorktreeNamingStrategy,
};
use crate::git::GitRunner;
use crate::persistence::{
    agent_exists, list_agent_definitions, list_repositories, load_configuration,
    save_configuration, seed_builtin_agents, touch_worktree_used as persist_touch_worktree_used,
    Database,
};
use crate::platform::PlatformPaths;
use crate::processes::{default_process_inspector, ProcessInspector};
use crate::terminals::WarpProvider;

mod agents;
mod naming;
mod repositories;
mod sessions;
mod terminals;
mod worktrees;

const DEFAULT_PID_POLL_ATTEMPTS: u32 = 5;
const DEFAULT_PID_POLL_INTERVAL: Duration = Duration::from_millis(200);

pub struct ForestService {
    db: Database,
    platform: PlatformPaths,
    git: GitRunner,
    terminals: WarpProvider,
    executables: Box<dyn ExecutableLocator>,
    processes: Box<dyn ProcessInspector>,
    pid_poll_attempts: u32,
    pid_poll_interval: Duration,
}

impl ForestService {
    pub fn initialize(db: Database, platform: PlatformPaths) -> Result<Self, ForestError> {
        let terminals = WarpProvider::system(platform.home_dir());
        Self::initialize_with(db, platform, terminals, Box::new(PathLocator))
    }

    pub(crate) fn initialize_with(
        db: Database,
        platform: PlatformPaths,
        terminals: WarpProvider,
        executables: Box<dyn ExecutableLocator>,
    ) -> Result<Self, ForestError> {
        Self::initialize_with_processes(
            db,
            platform,
            terminals,
            executables,
            default_process_inspector(),
            DEFAULT_PID_POLL_ATTEMPTS,
            DEFAULT_PID_POLL_INTERVAL,
        )
    }

    pub(crate) fn initialize_with_processes(
        db: Database,
        platform: PlatformPaths,
        terminals: WarpProvider,
        executables: Box<dyn ExecutableLocator>,
        processes: Box<dyn ProcessInspector>,
        pid_poll_attempts: u32,
        pid_poll_interval: Duration,
    ) -> Result<Self, ForestError> {
        db.migrate()?;
        let service = Self {
            db,
            platform,
            git: GitRunner::new(),
            terminals,
            executables,
            processes,
            pid_poll_attempts,
            pid_poll_interval,
        };
        service.ensure_default_configuration()?;
        seed_builtin_agents(service.db.connection())?;
        let configuration = service.configuration()?;
        PlatformPaths::ensure_forest_layout(&configuration.forest_root)?;
        service.reconcile_agent_sessions()?;
        Ok(service)
    }

    pub fn state(&self) -> Result<ForestState, ForestError> {
        let configuration = self.configuration()?;
        Ok(ForestState {
            app_info: AppInfo::current(),
            paths: self.platform.resolved(configuration.forest_root.clone()),
            configuration,
            database_initialized: true,
            schema_version: self.db.schema_version()?,
            agent_definitions: list_agent_definitions(self.db.connection())?,
            repositories: list_repositories(self.db.connection())?,
        })
    }

    pub fn configuration(&self) -> Result<ForestConfiguration, ForestError> {
        load_configuration(self.db.connection())?.ok_or(ForestError::ConfigurationMissing)
    }

    pub fn update_configuration(
        &self,
        mut configuration: ForestConfiguration,
    ) -> Result<ForestState, ForestError> {
        configuration.forest_root = self.platform.expand_user_path(configuration.forest_root);
        if !configuration.forest_root.is_absolute() {
            return Err(ForestError::ForestRootNotAbsolute);
        }
        if !agent_exists(
            self.db.connection(),
            configuration.default_agent_id.as_str(),
        )? {
            return Err(ForestError::UnknownAgent(
                configuration.default_agent_id.as_str().to_owned(),
            ));
        }

        self.persist_configuration(&configuration)?;
        self.state()
    }

    pub fn list_repositories(&self) -> Result<Vec<Repository>, ForestError> {
        list_repositories(self.db.connection())
    }

    pub fn register_repository(
        &self,
        name: String,
        path: PathBuf,
        _mode: crate::domain::RepositoryMode,
    ) -> Result<ForestState, ForestError> {
        self.import_repository(Some(name), path)
    }

    fn persist_configuration(
        &self,
        configuration: &ForestConfiguration,
    ) -> Result<(), ForestError> {
        PlatformPaths::ensure_forest_layout(&configuration.forest_root)?;
        save_configuration(self.db.connection(), configuration)
    }

    fn ensure_default_configuration(&self) -> Result<(), ForestError> {
        if load_configuration(self.db.connection())?.is_some() {
            return Ok(());
        }

        self.persist_configuration(&ForestConfiguration {
            forest_root: self.platform.default_forest_root(),
            default_terminal: TerminalProviderId::Warp,
            default_agent_id: crate::domain::AgentDefinitionId::from_string("codex"),
            worktree_naming_strategy: WorktreeNamingStrategy::BranchSlug,
            launch_behavior: LaunchBehavior::Auto,
            theme: ThemePreference::System,
        })
    }

    fn touch_worktree_used(
        &self,
        id: &WorktreeId,
    ) -> Result<chrono::DateTime<chrono::Utc>, ForestError> {
        let at = chrono::Utc::now();
        persist_touch_worktree_used(self.db.connection(), id, at)?;
        Ok(at)
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::ForestService;
    use crate::domain::{
        ForestConfiguration, ForestError, LaunchBehavior, RepositoryMode, TerminalProviderId,
        ThemePreference, WorktreeNamingStrategy,
    };
    use crate::persistence::Database;
    use crate::platform::PlatformPaths;
    use std::path::PathBuf;

    pub(crate) struct TempEnv {
        pub root: PathBuf,
    }

    impl TempEnv {
        pub fn new() -> Self {
            let root =
                std::env::temp_dir().join(format!("git-forest-service-{}", uuid::Uuid::new_v4()));
            std::fs::create_dir_all(root.join("app-data")).expect("app data");
            std::fs::create_dir_all(root.join("home")).expect("home");
            std::fs::create_dir_all(root.join("linked")).expect("linked");
            std::fs::create_dir_all(root.join("managed")).expect("managed");
            Self { root }
        }

        pub(crate) fn platform(&self) -> PlatformPaths {
            PlatformPaths::new(self.root.join("app-data"), self.root.join("home"))
        }

        fn db_path(&self) -> PathBuf {
            self.root.join("app-data").join("forest.db")
        }
    }

    impl Drop for TempEnv {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.root);
        }
    }

    pub(crate) fn open_service(env: &TempEnv) -> ForestService {
        open_service_with(
            env,
            crate::terminals::WarpProvider::system(env.platform().home_dir()),
        )
    }

    pub(crate) fn open_service_with(
        env: &TempEnv,
        terminals: crate::terminals::WarpProvider,
    ) -> ForestService {
        open_service_with_locator(env, terminals, Box::new(crate::agents::PathLocator))
    }

    pub(crate) fn open_service_with_locator(
        env: &TempEnv,
        terminals: crate::terminals::WarpProvider,
        executables: Box<dyn crate::agents::ExecutableLocator>,
    ) -> ForestService {
        open_service_with_processes(
            env,
            terminals,
            executables,
            Box::new(crate::processes::fake::FakeProcessInspector::new()),
        )
    }

    pub(crate) fn open_service_with_processes(
        env: &TempEnv,
        terminals: crate::terminals::WarpProvider,
        executables: Box<dyn crate::agents::ExecutableLocator>,
        processes: Box<dyn crate::processes::ProcessInspector>,
    ) -> ForestService {
        let db = Database::open(&env.db_path()).expect("open db");
        ForestService::initialize_with_processes(
            db,
            env.platform(),
            terminals,
            executables,
            processes,
            2,
            std::time::Duration::ZERO,
        )
        .expect("initialize")
    }

    #[test]
    fn default_configuration_created_on_first_open() {
        let env = TempEnv::new();
        let service = open_service(&env);
        let configuration = service.configuration().expect("config");

        assert_eq!(
            configuration.forest_root,
            env.root.join("home").join("forest")
        );
        assert_eq!(configuration.default_terminal, TerminalProviderId::Warp);
        assert_eq!(configuration.default_agent_id.as_str(), "codex");
        assert_eq!(
            configuration.worktree_naming_strategy,
            WorktreeNamingStrategy::BranchSlug
        );
        assert_eq!(configuration.launch_behavior, LaunchBehavior::Auto);
        assert!(env.root.join("home/forest/repos").is_dir());
        assert!(env.root.join("home/forest/worktrees").is_dir());
    }

    #[test]
    fn forest_configuration_round_trips_through_settings_table() {
        let env = TempEnv::new();
        let service = open_service(&env);
        let next_root = env.root.join("home").join("moved-forest");
        let updated = service
            .update_configuration(ForestConfiguration {
                forest_root: next_root.clone(),
                default_terminal: TerminalProviderId::Warp,
                default_agent_id: crate::domain::AgentDefinitionId::from_string("claude"),
                worktree_naming_strategy: WorktreeNamingStrategy::BranchAsIs,
                launch_behavior: LaunchBehavior::Tab,
                theme: ThemePreference::Dark,
            })
            .expect("update");

        assert_eq!(updated.configuration.forest_root, next_root);
        assert_eq!(updated.configuration.theme, ThemePreference::Dark);
        assert_eq!(updated.configuration.default_agent_id.as_str(), "claude");
        assert_eq!(
            updated.configuration.worktree_naming_strategy,
            WorktreeNamingStrategy::BranchAsIs
        );
        assert!(next_root.join("repos").is_dir());
    }

    #[test]
    fn rejected_forest_root_is_not_persisted() {
        let env = TempEnv::new();
        let service = open_service(&env);
        let original_root = service.configuration().expect("config").forest_root;
        let blocker = env.root.join("not-a-directory");
        std::fs::write(&blocker, b"not a directory").expect("write blocker");

        let error = service
            .update_configuration(ForestConfiguration {
                forest_root: blocker.join("forest"),
                default_terminal: TerminalProviderId::Warp,
                default_agent_id: crate::domain::AgentDefinitionId::from_string("codex"),
                worktree_naming_strategy: WorktreeNamingStrategy::BranchSlug,
                launch_behavior: LaunchBehavior::Auto,
                theme: ThemePreference::System,
            })
            .expect_err("unusable root");

        assert!(matches!(error, ForestError::Io(_)));
        assert_eq!(
            service.configuration().expect("config").forest_root,
            original_root
        );

        drop(service);
        let reopened = open_service(&env);
        assert_eq!(
            reopened.configuration().expect("reopen").forest_root,
            original_root
        );
    }

    #[test]
    fn builtin_agent_definitions_seeded_once() {
        let env = TempEnv::new();
        let first = open_service(&env);
        let second = open_service(&env);
        let first_ids: Vec<_> = first
            .state()
            .expect("state")
            .agent_definitions
            .iter()
            .map(|agent| agent.id.as_str().to_owned())
            .collect();
        let second_ids: Vec<_> = second
            .state()
            .expect("state")
            .agent_definitions
            .iter()
            .map(|agent| agent.id.as_str().to_owned())
            .collect();

        assert_eq!(first_ids.len(), 4);
        assert_eq!(first_ids, second_ids);
        assert!(first_ids.contains(&"codex".to_owned()));
    }

    #[test]
    fn register_repository_imports_git_repositories_as_linked() {
        let env = TempEnv::new();
        let service = open_service(&env);
        crate::git::testing::init_repository_at(&env.root.join("linked"));
        crate::git::testing::init_repository_at(&env.root.join("managed"));
        service
            .register_repository(
                "Linked Repo".to_owned(),
                env.root.join("linked"),
                RepositoryMode::Linked,
            )
            .expect("linked");
        service
            .register_repository(
                "Also Linked".to_owned(),
                env.root.join("managed"),
                RepositoryMode::Managed,
            )
            .expect("second");

        let repositories = service.list_repositories().expect("list");
        assert_eq!(repositories.len(), 2);
        assert!(repositories
            .iter()
            .all(|repo| repo.mode == RepositoryMode::Linked));
        assert!(repositories.iter().any(|repo| repo.name == "Linked Repo"));
        assert!(repositories.iter().any(|repo| repo.name == "Also Linked"));
        assert!(env.root.join("linked").is_dir());
        assert!(env.root.join("managed").is_dir());
    }

    #[test]
    fn register_repository_rejects_duplicate_path() {
        let env = TempEnv::new();
        let service = open_service(&env);
        crate::git::testing::init_repository_at(&env.root.join("linked"));
        service
            .register_repository(
                "First".to_owned(),
                env.root.join("linked"),
                RepositoryMode::Linked,
            )
            .expect("first");

        let error = service
            .register_repository(
                "Second".to_owned(),
                env.root.join("linked").join(".").canonicalize().unwrap(),
                RepositoryMode::Managed,
            )
            .expect_err("duplicate");
        assert!(matches!(error, ForestError::DuplicatePath));
    }

    #[test]
    fn register_repository_rejects_relative_and_missing_paths() {
        let env = TempEnv::new();
        let service = open_service(&env);

        let relative = service
            .register_repository(
                "Relative".to_owned(),
                PathBuf::from("not-absolute"),
                RepositoryMode::Linked,
            )
            .expect_err("relative");
        assert!(matches!(relative, ForestError::PathNotAbsolute));

        let missing = service
            .register_repository(
                "Missing".to_owned(),
                env.root.join("does-not-exist"),
                RepositoryMode::Linked,
            )
            .expect_err("missing");
        assert!(matches!(missing, ForestError::PathNotDirectory));
    }

    #[test]
    fn forest_service_survives_close_and_reopen() {
        let env = TempEnv::new();
        {
            let service = open_service(&env);
            crate::git::testing::init_repository_at(&env.root.join("linked"));
            service
                .register_repository(
                    "Keep Me".to_owned(),
                    env.root.join("linked"),
                    RepositoryMode::Linked,
                )
                .expect("register");
        }

        let reopened = open_service(&env);
        let state = reopened.state().expect("reopen");
        assert_eq!(state.schema_version, 4);
        assert_eq!(state.repositories.len(), 1);
        assert_eq!(state.repositories[0].name, "Keep Me");
        assert_eq!(state.configuration.default_agent_id.as_str(), "codex");
    }
}
