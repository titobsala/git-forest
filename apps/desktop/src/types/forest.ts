export type RepositoryId = string;
export type WorktreeId = string;
export type AgentDefinitionId = string;
export type AgentSessionId = string;

export type RepositoryMode = "managed" | "linked";
export type TerminalProviderId = "warp";
export type WorktreeNamingStrategy = "branch_slug" | "branch_as_is";
export type LaunchBehavior = "auto" | "tab" | "window";
export type AgentSessionStatus =
  "starting" | "running" | "exited" | "unknown" | "failed";

export interface AppInfo {
  name: string;
  version: string;
  tagline: string;
}

export interface ForestConfiguration {
  forestRoot: string;
  defaultTerminal: TerminalProviderId;
  defaultAgentId: AgentDefinitionId;
  worktreeNamingStrategy: WorktreeNamingStrategy;
  launchBehavior: LaunchBehavior;
}

export interface ForestPaths {
  appDataDir: string;
  databasePath: string;
  forestRoot: string;
}

export interface Repository {
  id: RepositoryId;
  name: string;
  path: string;
  mode: RepositoryMode;
  createdAt: string;
  updatedAt: string;
}

export interface Worktree {
  id: WorktreeId;
  repositoryId: RepositoryId;
  name: string;
  path: string;
  branch: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentDefinition {
  id: AgentDefinitionId;
  name: string;
  command: string;
  args: string[];
  isBuiltin: boolean;
}

export interface AgentSession {
  id: AgentSessionId;
  worktreeId: WorktreeId;
  agentDefinitionId: AgentDefinitionId;
  status: AgentSessionStatus;
  pid: number | null;
  launchedAt: string | null;
  lastSeenAt: string | null;
  exitedAt: string | null;
}

export interface ForestState {
  appInfo: AppInfo;
  configuration: ForestConfiguration;
  paths: ForestPaths;
  databaseInitialized: boolean;
  schemaVersion: number;
  agentDefinitions: AgentDefinition[];
  repositories: Repository[];
}

export interface CommandError {
  code: string;
  message: string;
}

export interface RegisterRepositoryInput {
  name: string;
  path: string;
  mode: RepositoryMode;
}

export const FALLBACK_APP_INFO: AppInfo = {
  name: "Git Forest",
  version: "0.0.2",
  tagline: "Configuration rooted.",
};

export const FALLBACK_FOREST_STATE: ForestState = {
  appInfo: FALLBACK_APP_INFO,
  configuration: {
    forestRoot: "/home/user/forest",
    defaultTerminal: "warp",
    defaultAgentId: "codex",
    worktreeNamingStrategy: "branch_slug",
    launchBehavior: "auto",
  },
  paths: {
    appDataDir: "/home/user/.local/share/dev.gitforest.desktop",
    databasePath: "/home/user/.local/share/dev.gitforest.desktop/forest.db",
    forestRoot: "/home/user/forest",
  },
  databaseInitialized: false,
  schemaVersion: 0,
  agentDefinitions: [
    {
      id: "codex",
      name: "Codex",
      command: "codex",
      args: [],
      isBuiltin: true,
    },
    {
      id: "claude",
      name: "Claude Code",
      command: "claude",
      args: [],
      isBuiltin: true,
    },
    {
      id: "opencode",
      name: "OpenCode",
      command: "opencode",
      args: [],
      isBuiltin: true,
    },
    {
      id: "cursor",
      name: "Cursor CLI",
      command: "cursor",
      args: [],
      isBuiltin: true,
    },
  ],
  repositories: [],
};
