import { invoke } from "@tauri-apps/api/core";
import { currentWorkspaceEnv } from "@/modules/workspace";

export type ReadResult =
  | { kind: "text"; content: string; size: number }
  | { kind: "binary"; size: number }
  | { kind: "toolarge"; size: number; limit: number };

export type DirEntry = {
  name: string;
  kind: "file" | "dir" | "symlink";
  size: number;
  mtime: number;
  gitignored: boolean;
};

export type CommandOutput = {
  stdout: string;
  stderr: string;
  exit_code: number | null;
  timed_out: boolean;
  truncated: boolean;
};

export type GrepHit = {
  path: string;
  rel: string;
  line: number;
  text: string;
};

export type GrepResponse = {
  hits: GrepHit[];
  truncated: boolean;
  files_scanned: number;
};

export type GlobHit = { path: string; rel: string };
export type GlobResponse = { hits: GlobHit[]; truncated: boolean };

export type GitRepoInfo = {
  repoRoot: string;
  branch: string;
  upstream: string | null;
  isDetached: boolean;
};

export type GitChangedFile = {
  path: string;
  originalPath: string | null;
  indexStatus: string;
  worktreeStatus: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
  statusLabel: string;
};

export type GitStatusSnapshot = {
  repoRoot: string;
  branch: string;
  upstream: string | null;
  ahead: number;
  behind: number;
  isDetached: boolean;
  truncated: boolean;
  changedFiles: GitChangedFile[];
};

export type GitDiffResult = {
  diffText: string;
  truncated: boolean;
};

export type GitDiffContentResult = {
  originalContent: string;
  modifiedContent: string;
  isBinary: boolean;
  fallbackPatch: string;
  truncated: boolean;
};

export type GitCommitResult = {
  commitSha: string;
  summary: string;
};

export type GitPushResult = {
  remote: string | null;
  branch: string | null;
  pushed: boolean;
};

export type GitLogEntry = {
  sha: string;
  shortSha: string;
  author: string;
  authorEmail: string;
  timestampSecs: number;
  parents: string[];
  subject: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
};

export type GitCommitFileChange = {
  path: string;
  originalPath: string | null;
  status: string;
  statusLabel: string;
  added: number;
  removed: number;
  isBinary: boolean;
};

export type GitPanelSnapshot = {
  repo: GitRepoInfo | null;
  status: GitStatusSnapshot | null;
};

export type GitDiscardEntry = {
  path: string;
  untracked: boolean;
};

export type GitBranchEntry = {
  name: string;
  kind: "local" | "worktree";
  worktreePath: string | null;
  isHead: boolean;
  isDetached: boolean;
};

export type GitBranchListResult = {
  branches: GitBranchEntry[];
};

// ─── Enhanced Git Types ──────────────────────────────────────────────────────

export type StashEntry = {
  index: number;
  message: string;
  date: string;
};

export type MergeResult = {
  success: boolean;
  hasConflicts: boolean;
  message: string;
};

export type RebaseResult = {
  success: boolean;
  hasConflicts: boolean;
  message: string;
};

export type ResetMode = "soft" | "mixed" | "hard";

export type TagInfo = {
  name: string;
  sha: string;
  message: string | null;
};

export type RemoteInfo = {
  name: string;
  url: string;
};

export type BlameEntry = {
  sha: string;
  author: string;
  date: string;
  lineNumber: number;
  content: string;
};

// ─── Native Tauri Commands ───────────────────────────────────────────────────

export const native = {
  workspaceCurrentDir: () => invoke<string>("workspace_current_dir"),
  workspaceAuthorize: (path: string) =>
    invoke<string>("workspace_authorize", {
      path,
      workspace: currentWorkspaceEnv(),
    }),
  readFile: (path: string) =>
    invoke<ReadResult>("fs_read_file", {
      path,
      workspace: currentWorkspaceEnv(),
    }),
  writeFile: (path: string, content: string) =>
    invoke<void>("fs_write_file", {
      path,
      content,
      workspace: currentWorkspaceEnv(),
    }),
  canonicalize: (path: string) =>
    invoke<string>("fs_canonicalize", {
      path,
      workspace: currentWorkspaceEnv(),
    }),
  createFile: (path: string) =>
    invoke<void>("fs_create_file", { path, workspace: currentWorkspaceEnv() }),
  createDir: (path: string) =>
    invoke<void>("fs_create_dir", { path, workspace: currentWorkspaceEnv() }),
  readDir: (path: string, showHidden = false) =>
    invoke<DirEntry[]>("fs_read_dir", {
      path,
      showHidden,
      workspace: currentWorkspaceEnv(),
    }),
  grep: (params: {
    pattern: string;
    root: string;
    glob?: string[];
    caseInsensitive?: boolean;
    maxResults?: number;
  }) =>
    invoke<GrepResponse>("fs_grep", {
      pattern: params.pattern,
      root: params.root,
      glob: params.glob ?? null,
      caseInsensitive: params.caseInsensitive ?? null,
      maxResults: params.maxResults ?? null,
      workspace: currentWorkspaceEnv(),
    }),
  glob: (params: { pattern: string; root: string; maxResults?: number }) =>
    invoke<GlobResponse>("fs_glob", {
      pattern: params.pattern,
      root: params.root,
      maxResults: params.maxResults ?? null,
      workspace: currentWorkspaceEnv(),
    }),
  runCommand: (
    command: string,
    cwd?: string | null,
    timeoutSecs?: number,
  ) =>
    invoke<CommandOutput>("shell_run_command", {
      command,
      cwd: cwd ?? null,
      timeoutSecs: timeoutSecs ?? null,
      workspace: currentWorkspaceEnv(),
    }),

  shellSessionOpen: (cwd?: string | null) =>
    invoke<number>("shell_session_open", {
      cwd: cwd ?? null,
      workspace: currentWorkspaceEnv(),
    }),
  shellSessionRun: (
    id: number,
    command: string,
    cwd?: string | null,
    timeoutSecs?: number,
  ) =>
    invoke<{
      stdout: string;
      stderr: string;
      exit_code: number | null;
      timed_out: boolean;
      truncated: boolean;
      cwd_after: string;
    }>("shell_session_run", {
      id,
      command,
      cwd: cwd ?? null,
      timeoutSecs: timeoutSecs ?? null,
      workspace: currentWorkspaceEnv(),
    }),
  shellSessionClose: (id: number) =>
    invoke<void>("shell_session_close", { id }),
  shellBgSpawn: (command: string, cwd?: string | null) =>
    invoke<number>("shell_bg_spawn", {
      command,
      cwd: cwd ?? null,
      workspace: currentWorkspaceEnv(),
    }),
  shellBgLogs: (handle: number, sinceOffset?: number) =>
    invoke<{
      bytes: string;
      next_offset: number;
      dropped: number;
      exited: boolean;
      exit_code: number | null;
    }>("shell_bg_logs", { handle, sinceOffset: sinceOffset ?? null }),
  shellBgKill: (handle: number) => invoke<void>("shell_bg_kill", { handle }),
  shellBgList: () =>
    invoke<
      {
        handle: number;
        command: string;
        cwd: string | null;
        started_at_ms: number;
        exited: boolean;
        exit_code: number | null;
      }[]
    >("shell_bg_list"),

  // ─── Git Core ────────────────────────────────────────────────────────────

  gitResolveRepo: (cwd: string) =>
    invoke<GitRepoInfo | null>("git_resolve_repo", {
      cwd,
      workspace: currentWorkspaceEnv(),
    }),
  gitPanelSnapshot: (cwd: string) =>
    invoke<GitPanelSnapshot>("git_panel_snapshot", {
      cwd,
      workspace: currentWorkspaceEnv(),
    }),
  gitStatus: (repoRoot: string) =>
    invoke<GitStatusSnapshot>("git_status", {
      repoRoot,
      workspace: currentWorkspaceEnv(),
    }),
  gitDiff: (repoRoot: string, path: string | null, staged: boolean) =>
    invoke<GitDiffResult>("git_diff", {
      repoRoot,
      path,
      staged,
      workspace: currentWorkspaceEnv(),
    }),
  gitDiffContent: (
    repoRoot: string,
    path: string,
    staged: boolean,
    originalPath?: string | null,
  ) =>
    invoke<GitDiffContentResult>("git_diff_content", {
      repoRoot,
      path,
      staged,
      originalPath: originalPath ?? null,
      workspace: currentWorkspaceEnv(),
    }),
  gitStage: (repoRoot: string, paths: string[]) =>
    invoke<void>("git_stage", {
      repoRoot,
      paths,
      workspace: currentWorkspaceEnv(),
    }),
  gitUnstage: (repoRoot: string, paths: string[]) =>
    invoke<void>("git_unstage", {
      repoRoot,
      paths,
      workspace: currentWorkspaceEnv(),
    }),
  gitDiscard: (repoRoot: string, entries: GitDiscardEntry[]) =>
    invoke<void>("git_discard", {
      repoRoot,
      entries,
      workspace: currentWorkspaceEnv(),
    }),
  gitCommit: (repoRoot: string, message: string) =>
    invoke<GitCommitResult>("git_commit", {
      repoRoot,
      message,
      workspace: currentWorkspaceEnv(),
    }),
  gitFetch: (repoRoot: string) =>
    invoke<void>("git_fetch", {
      repoRoot,
      workspace: currentWorkspaceEnv(),
    }),
  gitPullFfOnly: (repoRoot: string) =>
    invoke<void>("git_pull_ff_only", {
      repoRoot,
      workspace: currentWorkspaceEnv(),
    }),
  gitPush: (repoRoot: string) =>
    invoke<GitPushResult>("git_push", {
      repoRoot,
      workspace: currentWorkspaceEnv(),
    }),
  gitLog: (repoRoot: string, options?: { limit?: number; beforeSha?: string }) =>
    invoke<GitLogEntry[]>("git_log", {
      repoRoot,
      limit: options?.limit ?? null,
      beforeSha: options?.beforeSha ?? null,
      workspace: currentWorkspaceEnv(),
    }),
  gitShowCommit: (repoRoot: string, sha: string) =>
    invoke<GitDiffResult>("git_show_commit", {
      repoRoot,
      sha,
      workspace: currentWorkspaceEnv(),
    }),
  gitCommitFiles: (repoRoot: string, sha: string) =>
    invoke<GitCommitFileChange[]>("git_commit_files", {
      repoRoot,
      sha,
      workspace: currentWorkspaceEnv(),
    }),
  gitCommitFileDiff: (
    repoRoot: string,
    sha: string,
    path: string,
    originalPath?: string | null,
  ) =>
    invoke<GitDiffContentResult>("git_commit_file_diff", {
      repoRoot,
      sha,
      path,
      originalPath: originalPath ?? null,
      workspace: currentWorkspaceEnv(),
    }),
  gitRemoteUrl: (repoRoot: string, name?: string) =>
    invoke<string | null>("git_remote_url", {
      repoRoot,
      name: name ?? null,
      workspace: currentWorkspaceEnv(),
    }),
  gitListBranches: (repoRoot: string) =>
    invoke<GitBranchListResult>("git_list_branches", {
      repoRoot,
      workspace: currentWorkspaceEnv(),
    }),
  gitCheckoutBranch: (repoRoot: string, branch: string) =>
    invoke<void>("git_checkout_branch", {
      repoRoot,
      branch,
      workspace: currentWorkspaceEnv(),
    }),

  // ─── Enhanced Git Commands ─────────────────────────────────────────────────

  gitStashSave: (repoRoot: string, message?: string) =>
    invoke<void>("git_stash_save", {
      repoRoot,
      message: message ?? null,
      workspace: currentWorkspaceEnv(),
    }),
  gitStashPop: (repoRoot: string, index?: number) =>
    invoke<void>("git_stash_pop", {
      repoRoot,
      index: index ?? null,
      workspace: currentWorkspaceEnv(),
    }),
  gitStashList: (repoRoot: string) =>
    invoke<StashEntry[]>("git_stash_list", {
      repoRoot,
      workspace: currentWorkspaceEnv(),
    }),
  gitStashDrop: (repoRoot: string, index: number) =>
    invoke<void>("git_stash_drop", {
      repoRoot,
      index,
      workspace: currentWorkspaceEnv(),
    }),
  gitMerge: (repoRoot: string, branch: string) =>
    invoke<MergeResult>("git_merge", {
      repoRoot,
      branch,
      workspace: currentWorkspaceEnv(),
    }),
  gitRebase: (repoRoot: string, ontoBranch: string) =>
    invoke<RebaseResult>("git_rebase", {
      repoRoot,
      ontoBranch,
      workspace: currentWorkspaceEnv(),
    }),
  gitRebaseAbort: (repoRoot: string) =>
    invoke<void>("git_rebase_abort", {
      repoRoot,
      workspace: currentWorkspaceEnv(),
    }),
  gitRebaseContinue: (repoRoot: string) =>
    invoke<void>("git_rebase_continue", {
      repoRoot,
      workspace: currentWorkspaceEnv(),
    }),
  gitRebaseSkip: (repoRoot: string) =>
    invoke<void>("git_rebase_skip", {
      repoRoot,
      workspace: currentWorkspaceEnv(),
    }),
  gitCherryPick: (repoRoot: string, sha: string) =>
    invoke<void>("git_cherry_pick", {
      repoRoot,
      sha,
      workspace: currentWorkspaceEnv(),
    }),
  gitRevert: (repoRoot: string, sha: string) =>
    invoke<void>("git_revert", {
      repoRoot,
      sha,
      workspace: currentWorkspaceEnv(),
    }),
  gitReset: (repoRoot: string, target: string, mode: ResetMode) =>
    invoke<void>("git_reset", {
      repoRoot,
      target,
      mode,
      workspace: currentWorkspaceEnv(),
    }),
  gitCreateBranch: (repoRoot: string, name: string, startPoint?: string) =>
    invoke<void>("git_create_branch", {
      repoRoot,
      name,
      startPoint: startPoint ?? null,
      workspace: currentWorkspaceEnv(),
    }),
  gitDeleteBranch: (repoRoot: string, name: string, force?: boolean) =>
    invoke<void>("git_delete_branch", {
      repoRoot,
      name,
      force: force ?? null,
      workspace: currentWorkspaceEnv(),
    }),
  gitRenameBranch: (repoRoot: string, oldName: string, newName: string) =>
    invoke<void>("git_rename_branch", {
      repoRoot,
      oldName,
      newName,
      workspace: currentWorkspaceEnv(),
    }),
  gitTagList: (repoRoot: string) =>
    invoke<TagInfo[]>("git_tag_list", {
      repoRoot,
      workspace: currentWorkspaceEnv(),
    }),
  gitTagCreate: (repoRoot: string, name: string, target?: string, message?: string) =>
    invoke<void>("git_tag_create", {
      repoRoot,
      name,
      target: target ?? null,
      message: message ?? null,
      workspace: currentWorkspaceEnv(),
    }),
  gitTagDelete: (repoRoot: string, name: string) =>
    invoke<void>("git_tag_delete", {
      repoRoot,
      name,
      workspace: currentWorkspaceEnv(),
    }),
  gitRemoteList: (repoRoot: string) =>
    invoke<RemoteInfo[]>("git_remote_list", {
      repoRoot,
      workspace: currentWorkspaceEnv(),
    }),
  gitRemoteAdd: (repoRoot: string, name: string, url: string) =>
    invoke<void>("git_remote_add", {
      repoRoot,
      name,
      url,
      workspace: currentWorkspaceEnv(),
    }),
  gitRemoteRemove: (repoRoot: string, name: string) =>
    invoke<void>("git_remote_remove", {
      repoRoot,
      name,
      workspace: currentWorkspaceEnv(),
    }),
  gitBlame: (repoRoot: string, filePath: string) =>
    invoke<BlameEntry[]>("git_blame", {
      repoRoot,
      filePath,
      workspace: currentWorkspaceEnv(),
    }),
  gitInit: (path: string) =>
    invoke<void>("git_init", {
      path,
      workspace: currentWorkspaceEnv(),
    }),
  gitClone: (url: string, targetDir: string) =>
    invoke<void>("git_clone", {
      url,
      targetDir,
      workspace: currentWorkspaceEnv(),
    }),
};
