export type RepositoryId = string;
export type WorktreeId = string;
export type AgentDefinitionId = string;
export type AgentSessionId = string;

export type RepositoryMode = "managed" | "linked";
export type TerminalProviderId = "warp";
export type WorktreeNamingStrategy = "branch_slug" | "branch_as_is";
export type LaunchBehavior = "auto" | "tab" | "window";
/** Appearance preference; "system" follows the desktop environment. */
export type ThemePreference = "system" | "light" | "dark";
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
  theme: ThemePreference;
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
  primaryBranch: string | null;
  remoteUrl: string | null;
  lastRefreshedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Worktree {
  id: WorktreeId;
  repositoryId: RepositoryId;
  name: string;
  path: string;
  branch: string | null;
  head: string | null;
  detached: boolean;
  locked: boolean;
  lockReason: string | null;
  prunable: boolean;
  present: boolean;
  gitKnown: boolean;
  isPrimary: boolean;
  trackedChanges: number;
  untrackedFiles: number;
  ahead: number | null;
  behind: number | null;
  createdAt: string;
  updatedAt: string;
}

export type RemovalBlocker =
  | "primary"
  | "locked"
  | "missing"
  | "unknown_to_git"
  | "dirty"
  | "untracked"
  | "active_session";

export interface LocalBranch {
  name: string;
}

export interface CreateWorktreeInput {
  repositoryId: RepositoryId;
  baseRef: string;
  branch: string;
  name?: string;
}

export interface CreateWorktreePreview {
  destination: string;
  repositorySlug: string;
  worktreeSlug: string;
}

export interface CreateWorktreeResult {
  worktree: Worktree;
  worktrees: Worktree[];
}

export interface WorktreeRemovalPreview {
  worktree: Worktree;
  allowed: boolean;
  requiresForce: boolean;
  blockers: RemovalBlocker[];
}

export interface RemoveWorktreeResult {
  removed: boolean;
  requiresForce: boolean;
  blockers: RemovalBlocker[];
  worktrees: Worktree[];
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

export interface ImportRepositoryInput {
  name?: string;
  path: string;
}

export interface ScanCandidate {
  path: string;
  name: string;
  primaryBranch: string | null;
  remoteUrl: string | null;
  alreadyIndexed: boolean;
}

export interface ScanProgressPayload {
  scanId: string;
  directoriesVisited: number;
  candidatesFound: number;
  currentPath: string | null;
  warnings: string[];
  cancelled: boolean;
}

export interface ScanCompletedPayload {
  scanId: string;
  directoriesVisited: number;
  candidates: ScanCandidate[];
  warnings: string[];
  cancelled: boolean;
}

export interface ImportSkip {
  path: string;
  reason: string;
}

export interface ImportFailure {
  path: string;
  code: string;
  message: string;
}

export interface ImportRepositoriesResult {
  imported: Repository[];
  skipped: ImportSkip[];
  failed: ImportFailure[];
  state: ForestState;
}

export const FALLBACK_APP_INFO: AppInfo = {
  name: "Git Forest",
  version: "0.0.4",
  tagline: "Worktrees in reach.",
};

export const FALLBACK_FOREST_STATE: ForestState = {
  appInfo: FALLBACK_APP_INFO,
  configuration: {
    forestRoot: "/home/user/forest",
    defaultTerminal: "warp",
    defaultAgentId: "codex",
    worktreeNamingStrategy: "branch_slug",
    launchBehavior: "auto",
    theme: "system",
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

export function sampleWorktree(overrides: Partial<Worktree> = {}): Worktree {
  return {
    id: "wt-1",
    repositoryId: "repo-1",
    name: "feat-risk-483",
    path: "/tmp/forest/worktrees/exog-app/feat-risk-483",
    branch: "feat/risk-483",
    head: "abcdef",
    detached: false,
    locked: false,
    lockReason: null,
    prunable: false,
    present: true,
    gitKnown: true,
    isPrimary: false,
    trackedChanges: 0,
    untrackedFiles: 0,
    ahead: null,
    behind: null,
    createdAt: "2026-08-20T09:00:00Z",
    updatedAt: "2026-08-20T09:00:00Z",
    ...overrides,
  };
}

export function sampleRepository(
  overrides: Partial<Repository> = {},
): Repository {
  return {
    id: "repo-1",
    name: "EXOG App",
    path: "/tmp/exog-app",
    mode: "linked",
    primaryBranch: "main",
    remoteUrl: "https://example.test/exog.git",
    lastRefreshedAt: "2026-08-20T09:00:00Z",
    createdAt: "2026-08-20T09:00:00Z",
    updatedAt: "2026-08-20T09:00:00Z",
    ...overrides,
  };
}
