use std::path::PathBuf;

use chrono::Utc;

use crate::domain::{
    AppInfo, ForestConfiguration, ForestError, ForestState, LaunchBehavior, Repository,
    RepositoryId, RepositoryMode, TerminalProviderId, WorktreeNamingStrategy,
};
use crate::persistence::{
    agent_exists, find_by_path, insert_repository, list_agent_definitions, list_repositories,
    load_configuration, save_configuration, seed_builtin_agents, Database,
};
use crate::platform::PlatformPaths;

pub struct ForestService {
    db: Database,
    platform: PlatformPaths,
}

impl ForestService {
    pub fn initialize(db: Database, platform: PlatformPaths) -> Result<Self, ForestError> {
        db.migrate()?;
        let service = Self { db, platform };
        service.ensure_default_configuration()?;
        seed_builtin_agents(service.db.connection())?;
        let configuration = service.configuration()?;
        PlatformPaths::ensure_forest_layout(&configuration.forest_root)?;
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

        save_configuration(self.db.connection(), &configuration)?;
        PlatformPaths::ensure_forest_layout(&configuration.forest_root)?;
        self.state()
    }

    pub fn list_repositories(&self) -> Result<Vec<Repository>, ForestError> {
        list_repositories(self.db.connection())
    }

    pub fn register_repository(
        &self,
        name: String,
        path: PathBuf,
        mode: RepositoryMode,
    ) -> Result<ForestState, ForestError> {
        let name = name.trim().to_owned();
        if name.is_empty() {
            return Err(ForestError::EmptyName);
        }

        let expanded = self.platform.expand_user_path(path);
        if !expanded.is_absolute() {
            return Err(ForestError::PathNotAbsolute);
        }
        if !expanded.is_dir() {
            return Err(ForestError::PathNotDirectory);
        }

        let canonical = expanded
            .canonicalize()
            .map_err(|_| ForestError::PathNotDirectory)?;
        if find_by_path(self.db.connection(), &canonical)?.is_some() {
            return Err(ForestError::DuplicatePath);
        }

        let now = Utc::now();
        insert_repository(
            self.db.connection(),
            &Repository {
                id: RepositoryId::generate(),
                name,
                path: canonical,
                mode,
                created_at: now,
                updated_at: now,
            },
        )?;
        self.state()
    }

    fn ensure_default_configuration(&self) -> Result<(), ForestError> {
        if load_configuration(self.db.connection())?.is_some() {
            return Ok(());
        }

        save_configuration(
            self.db.connection(),
            &ForestConfiguration {
                forest_root: self.platform.default_forest_root(),
                default_terminal: TerminalProviderId::Warp,
                default_agent_id: crate::domain::AgentDefinitionId::from_string("codex"),
                worktree_naming_strategy: WorktreeNamingStrategy::BranchSlug,
                launch_behavior: LaunchBehavior::Auto,
            },
        )
    }
}

#[cfg(test)]
mod tests {
    use super::ForestService;
    use crate::domain::{
        ForestConfiguration, ForestError, LaunchBehavior, RepositoryMode, TerminalProviderId,
        WorktreeNamingStrategy,
    };
    use crate::persistence::Database;
    use crate::platform::PlatformPaths;
    use std::path::PathBuf;

    struct TempEnv {
        root: PathBuf,
    }

    impl TempEnv {
        fn new() -> Self {
            let root =
                std::env::temp_dir().join(format!("git-forest-service-{}", uuid::Uuid::new_v4()));
            std::fs::create_dir_all(root.join("app-data")).expect("app data");
            std::fs::create_dir_all(root.join("home")).expect("home");
            std::fs::create_dir_all(root.join("linked")).expect("linked");
            std::fs::create_dir_all(root.join("managed")).expect("managed");
            Self { root }
        }

        fn platform(&self) -> PlatformPaths {
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

    fn open_service(env: &TempEnv) -> ForestService {
        let db = Database::open(&env.db_path()).expect("open db");
        ForestService::initialize(db, env.platform()).expect("initialize")
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
            })
            .expect("update");

        assert_eq!(updated.configuration.forest_root, next_root);
        assert_eq!(updated.configuration.default_agent_id.as_str(), "claude");
        assert_eq!(
            updated.configuration.worktree_naming_strategy,
            WorktreeNamingStrategy::BranchAsIs
        );
        assert!(next_root.join("repos").is_dir());
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
    fn register_repository_persists_linked_and_managed_modes() {
        let env = TempEnv::new();
        let service = open_service(&env);
        service
            .register_repository(
                "Linked Repo".to_owned(),
                env.root.join("linked"),
                RepositoryMode::Linked,
            )
            .expect("linked");
        service
            .register_repository(
                "Managed Repo".to_owned(),
                env.root.join("managed"),
                RepositoryMode::Managed,
            )
            .expect("managed");

        let repositories = service.list_repositories().expect("list");
        assert_eq!(repositories.len(), 2);
        assert!(repositories
            .iter()
            .any(|repo| repo.mode == RepositoryMode::Linked && repo.name == "Linked Repo"));
        assert!(repositories
            .iter()
            .any(|repo| repo.mode == RepositoryMode::Managed && repo.name == "Managed Repo"));
        assert!(env.root.join("linked").is_dir());
        assert!(env.root.join("managed").is_dir());
    }

    #[test]
    fn register_repository_rejects_duplicate_path() {
        let env = TempEnv::new();
        let service = open_service(&env);
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
        assert_eq!(state.schema_version, 1);
        assert_eq!(state.repositories.len(), 1);
        assert_eq!(state.repositories[0].name, "Keep Me");
        assert_eq!(state.configuration.default_agent_id.as_str(), "codex");
    }
}
