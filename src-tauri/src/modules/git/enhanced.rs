use crate::modules::git::errors::Result;
use crate::modules::git::process::{ensure_git_available, ensure_success, run_git};
use crate::modules::git::types::{
    BlameEntry, MergeResult, RebaseResult, RemoteInfo, ResetMode, StashEntry, TagInfo,
    DEFAULT_TIMEOUT_SECS, NETWORK_TIMEOUT_SECS,
};
use crate::modules::git::utils::authorized_repo_root;
use crate::modules::workspace::{WorkspaceEnv, WorkspaceRegistry};

// ─── Stash Operations ────────────────────────────────────────────────────────

pub fn stash_save(
    registry: &WorkspaceRegistry,
    repo_root: &str,
    message: Option<&str>,
    workspace: &WorkspaceEnv,
) -> Result<()> {
    let repo = authorized_repo_root(registry, repo_root, workspace)?;
    ensure_git_available(&repo.workspace)?;
    let mut args: Vec<&str> = vec!["stash", "push"];
    if let Some(msg) = message {
        args.push("-m");
        args.push(msg);
    }
    let output = run_git(&repo.workspace, Some(&repo.git_path), args, DEFAULT_TIMEOUT_SECS)?;
    ensure_success(&output, "stash save failed")?;
    Ok(())
}

pub fn stash_pop(
    registry: &WorkspaceRegistry,
    repo_root: &str,
    index: Option<u32>,
    workspace: &WorkspaceEnv,
) -> Result<()> {
    let repo = authorized_repo_root(registry, repo_root, workspace)?;
    ensure_git_available(&repo.workspace)?;
    let idx_str = index.map(|i| format!("stash@{{{}}}", i));
    let mut args: Vec<&str> = vec!["stash", "pop"];
    if let Some(ref s) = idx_str {
        args.push(s);
    }
    let output = run_git(&repo.workspace, Some(&repo.git_path), args, DEFAULT_TIMEOUT_SECS)?;
    ensure_success(&output, "stash pop failed")?;
    Ok(())
}

pub fn stash_list(
    registry: &WorkspaceRegistry,
    repo_root: &str,
    workspace: &WorkspaceEnv,
) -> Result<Vec<StashEntry>> {
    let repo = authorized_repo_root(registry, repo_root, workspace)?;
    ensure_git_available(&repo.workspace)?;
    let output = run_git(
        &repo.workspace,
        Some(&repo.git_path),
        ["stash", "list", "--format=%gd%x00%s%x00%ai"],
        DEFAULT_TIMEOUT_SECS,
    )?;
    ensure_success(&output, "stash list failed")?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let entries = stdout
        .lines()
        .filter(|l| !l.is_empty())
        .enumerate()
        .filter_map(|(i, line)| {
            let parts: Vec<&str> = line.splitn(3, '\0').collect();
            if parts.len() >= 2 {
                Some(StashEntry {
                    index: i as u32,
                    message: parts[1].to_string(),
                    date: parts.get(2).unwrap_or(&"").to_string(),
                })
            } else {
                None
            }
        })
        .collect();
    Ok(entries)
}

pub fn stash_drop(
    registry: &WorkspaceRegistry,
    repo_root: &str,
    index: u32,
    workspace: &WorkspaceEnv,
) -> Result<()> {
    let repo = authorized_repo_root(registry, repo_root, workspace)?;
    ensure_git_available(&repo.workspace)?;
    let idx_str = format!("stash@{{{}}}", index);
    let output = run_git(
        &repo.workspace,
        Some(&repo.git_path),
        ["stash", "drop", &idx_str],
        DEFAULT_TIMEOUT_SECS,
    )?;
    ensure_success(&output, "stash drop failed")?;
    Ok(())
}

// ─── Merge / Rebase ──────────────────────────────────────────────────────────

pub fn merge(
    registry: &WorkspaceRegistry,
    repo_root: &str,
    branch: &str,
    workspace: &WorkspaceEnv,
) -> Result<MergeResult> {
    let repo = authorized_repo_root(registry, repo_root, workspace)?;
    ensure_git_available(&repo.workspace)?;
    let output = run_git(
        &repo.workspace,
        Some(&repo.git_path),
        ["merge", branch],
        DEFAULT_TIMEOUT_SECS,
    )?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let has_conflicts = stderr.contains("CONFLICT") || stdout.contains("CONFLICT");
    let success = output.exit_code == Some(0);
    let message = if has_conflicts {
        "Merge conflicts detected. Resolve conflicts and commit.".to_string()
    } else if success {
        stdout.lines().next().unwrap_or("Merge complete").to_string()
    } else {
        stderr
    };
    Ok(MergeResult {
        success,
        has_conflicts,
        message,
    })
}

pub fn rebase(
    registry: &WorkspaceRegistry,
    repo_root: &str,
    onto_branch: &str,
    workspace: &WorkspaceEnv,
) -> Result<RebaseResult> {
    let repo = authorized_repo_root(registry, repo_root, workspace)?;
    ensure_git_available(&repo.workspace)?;
    let output = run_git(
        &repo.workspace,
        Some(&repo.git_path),
        ["rebase", onto_branch],
        DEFAULT_TIMEOUT_SECS,
    )?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let has_conflicts = stderr.contains("CONFLICT") || stdout.contains("CONFLICT");
    let success = output.exit_code == Some(0);
    let message = if has_conflicts {
        "Rebase conflicts detected. Resolve and run rebase --continue.".to_string()
    } else if success {
        "Rebase complete".to_string()
    } else {
        stderr
    };
    Ok(RebaseResult {
        success,
        has_conflicts,
        message,
    })
}

pub fn rebase_abort(
    registry: &WorkspaceRegistry,
    repo_root: &str,
    workspace: &WorkspaceEnv,
) -> Result<()> {
    let repo = authorized_repo_root(registry, repo_root, workspace)?;
    ensure_git_available(&repo.workspace)?;
    let output = run_git(
        &repo.workspace,
        Some(&repo.git_path),
        ["rebase", "--abort"],
        DEFAULT_TIMEOUT_SECS,
    )?;
    ensure_success(&output, "rebase abort failed")?;
    Ok(())
}

pub fn rebase_continue(
    registry: &WorkspaceRegistry,
    repo_root: &str,
    workspace: &WorkspaceEnv,
) -> Result<()> {
    let repo = authorized_repo_root(registry, repo_root, workspace)?;
    ensure_git_available(&repo.workspace)?;
    let output = run_git(
        &repo.workspace,
        Some(&repo.git_path),
        ["rebase", "--continue"],
        DEFAULT_TIMEOUT_SECS,
    )?;
    ensure_success(&output, "rebase continue failed")?;
    Ok(())
}

pub fn rebase_skip(
    registry: &WorkspaceRegistry,
    repo_root: &str,
    workspace: &WorkspaceEnv,
) -> Result<()> {
    let repo = authorized_repo_root(registry, repo_root, workspace)?;
    ensure_git_available(&repo.workspace)?;
    let output = run_git(
        &repo.workspace,
        Some(&repo.git_path),
        ["rebase", "--skip"],
        DEFAULT_TIMEOUT_SECS,
    )?;
    ensure_success(&output, "rebase skip failed")?;
    Ok(())
}

// ─── Cherry-pick / Revert ────────────────────────────────────────────────────

pub fn cherry_pick(
    registry: &WorkspaceRegistry,
    repo_root: &str,
    sha: &str,
    workspace: &WorkspaceEnv,
) -> Result<()> {
    let repo = authorized_repo_root(registry, repo_root, workspace)?;
    ensure_git_available(&repo.workspace)?;
    let output = run_git(
        &repo.workspace,
        Some(&repo.git_path),
        ["cherry-pick", sha],
        DEFAULT_TIMEOUT_SECS,
    )?;
    ensure_success(&output, "cherry-pick failed")?;
    Ok(())
}

pub fn revert_commit(
    registry: &WorkspaceRegistry,
    repo_root: &str,
    sha: &str,
    workspace: &WorkspaceEnv,
) -> Result<()> {
    let repo = authorized_repo_root(registry, repo_root, workspace)?;
    ensure_git_available(&repo.workspace)?;
    let output = run_git(
        &repo.workspace,
        Some(&repo.git_path),
        ["revert", "--no-edit", sha],
        DEFAULT_TIMEOUT_SECS,
    )?;
    ensure_success(&output, "revert failed")?;
    Ok(())
}

// ─── Reset ───────────────────────────────────────────────────────────────────

pub fn reset(
    registry: &WorkspaceRegistry,
    repo_root: &str,
    target: &str,
    mode: ResetMode,
    workspace: &WorkspaceEnv,
) -> Result<()> {
    let repo = authorized_repo_root(registry, repo_root, workspace)?;
    ensure_git_available(&repo.workspace)?;
    let mode_flag = match mode {
        ResetMode::Soft => "--soft",
        ResetMode::Mixed => "--mixed",
        ResetMode::Hard => "--hard",
    };
    let output = run_git(
        &repo.workspace,
        Some(&repo.git_path),
        ["reset", mode_flag, target],
        DEFAULT_TIMEOUT_SECS,
    )?;
    ensure_success(&output, "reset failed")?;
    Ok(())
}

// ─── Branch Management ───────────────────────────────────────────────────────

pub fn create_branch(
    registry: &WorkspaceRegistry,
    repo_root: &str,
    name: &str,
    start_point: Option<&str>,
    workspace: &WorkspaceEnv,
) -> Result<()> {
    let repo = authorized_repo_root(registry, repo_root, workspace)?;
    ensure_git_available(&repo.workspace)?;
    let mut args: Vec<&str> = vec!["branch", name];
    if let Some(sp) = start_point {
        args.push(sp);
    }
    let output = run_git(&repo.workspace, Some(&repo.git_path), args, DEFAULT_TIMEOUT_SECS)?;
    ensure_success(&output, "create branch failed")?;
    Ok(())
}

pub fn delete_branch(
    registry: &WorkspaceRegistry,
    repo_root: &str,
    name: &str,
    force: bool,
    workspace: &WorkspaceEnv,
) -> Result<()> {
    let repo = authorized_repo_root(registry, repo_root, workspace)?;
    ensure_git_available(&repo.workspace)?;
    let flag = if force { "-D" } else { "-d" };
    let output = run_git(
        &repo.workspace,
        Some(&repo.git_path),
        ["branch", flag, name],
        DEFAULT_TIMEOUT_SECS,
    )?;
    ensure_success(&output, "delete branch failed")?;
    Ok(())
}

pub fn rename_branch(
    registry: &WorkspaceRegistry,
    repo_root: &str,
    old_name: &str,
    new_name: &str,
    workspace: &WorkspaceEnv,
) -> Result<()> {
    let repo = authorized_repo_root(registry, repo_root, workspace)?;
    ensure_git_available(&repo.workspace)?;
    let output = run_git(
        &repo.workspace,
        Some(&repo.git_path),
        ["branch", "-m", old_name, new_name],
        DEFAULT_TIMEOUT_SECS,
    )?;
    ensure_success(&output, "rename branch failed")?;
    Ok(())
}

// ─── Tag Management ──────────────────────────────────────────────────────────

pub fn tag_list(
    registry: &WorkspaceRegistry,
    repo_root: &str,
    workspace: &WorkspaceEnv,
) -> Result<Vec<TagInfo>> {
    let repo = authorized_repo_root(registry, repo_root, workspace)?;
    ensure_git_available(&repo.workspace)?;
    let output = run_git(
        &repo.workspace,
        Some(&repo.git_path),
        [
            "tag",
            "-l",
            "--format=%(refname:short)%00%(objectname:short)%00%(subject)",
        ],
        DEFAULT_TIMEOUT_SECS,
    )?;
    ensure_success(&output, "tag list failed")?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let tags = stdout
        .lines()
        .filter(|l| !l.is_empty())
        .filter_map(|line| {
            let parts: Vec<&str> = line.splitn(3, '\0').collect();
            if parts.len() >= 2 {
                Some(TagInfo {
                    name: parts[0].to_string(),
                    sha: parts[1].to_string(),
                    message: parts.get(2).filter(|s| !s.is_empty()).map(|s| s.to_string()),
                })
            } else {
                None
            }
        })
        .collect();
    Ok(tags)
}

pub fn tag_create(
    registry: &WorkspaceRegistry,
    repo_root: &str,
    name: &str,
    target: Option<&str>,
    message: Option<&str>,
    workspace: &WorkspaceEnv,
) -> Result<()> {
    let repo = authorized_repo_root(registry, repo_root, workspace)?;
    ensure_git_available(&repo.workspace)?;
    let mut args: Vec<&str> = vec!["tag"];
    if let Some(msg) = message {
        args.push("-a");
        args.push(name);
        args.push("-m");
        args.push(msg);
    } else {
        args.push(name);
    }
    if let Some(t) = target {
        args.push(t);
    }
    let output = run_git(&repo.workspace, Some(&repo.git_path), args, DEFAULT_TIMEOUT_SECS)?;
    ensure_success(&output, "tag create failed")?;
    Ok(())
}

pub fn tag_delete(
    registry: &WorkspaceRegistry,
    repo_root: &str,
    name: &str,
    workspace: &WorkspaceEnv,
) -> Result<()> {
    let repo = authorized_repo_root(registry, repo_root, workspace)?;
    ensure_git_available(&repo.workspace)?;
    let output = run_git(
        &repo.workspace,
        Some(&repo.git_path),
        ["tag", "-d", name],
        DEFAULT_TIMEOUT_SECS,
    )?;
    ensure_success(&output, "tag delete failed")?;
    Ok(())
}

// ─── Remote Management ───────────────────────────────────────────────────────

pub fn remote_list(
    registry: &WorkspaceRegistry,
    repo_root: &str,
    workspace: &WorkspaceEnv,
) -> Result<Vec<RemoteInfo>> {
    let repo = authorized_repo_root(registry, repo_root, workspace)?;
    ensure_git_available(&repo.workspace)?;
    let output = run_git(
        &repo.workspace,
        Some(&repo.git_path),
        ["remote", "-v"],
        DEFAULT_TIMEOUT_SECS,
    )?;
    ensure_success(&output, "remote list failed")?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut remotes: Vec<RemoteInfo> = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for line in stdout.lines() {
        // Format: "origin\thttps://... (fetch)"
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 2 {
            let name = parts[0].to_string();
            if seen.insert(name.clone()) {
                remotes.push(RemoteInfo {
                    name,
                    url: parts[1].to_string(),
                });
            }
        }
    }
    Ok(remotes)
}

pub fn remote_add(
    registry: &WorkspaceRegistry,
    repo_root: &str,
    name: &str,
    url: &str,
    workspace: &WorkspaceEnv,
) -> Result<()> {
    let repo = authorized_repo_root(registry, repo_root, workspace)?;
    ensure_git_available(&repo.workspace)?;
    let output = run_git(
        &repo.workspace,
        Some(&repo.git_path),
        ["remote", "add", name, url],
        DEFAULT_TIMEOUT_SECS,
    )?;
    ensure_success(&output, "remote add failed")?;
    Ok(())
}

pub fn remote_remove(
    registry: &WorkspaceRegistry,
    repo_root: &str,
    name: &str,
    workspace: &WorkspaceEnv,
) -> Result<()> {
    let repo = authorized_repo_root(registry, repo_root, workspace)?;
    ensure_git_available(&repo.workspace)?;
    let output = run_git(
        &repo.workspace,
        Some(&repo.git_path),
        ["remote", "remove", name],
        DEFAULT_TIMEOUT_SECS,
    )?;
    ensure_success(&output, "remote remove failed")?;
    Ok(())
}

// ─── Blame ───────────────────────────────────────────────────────────────────

pub fn blame(
    registry: &WorkspaceRegistry,
    repo_root: &str,
    file_path: &str,
    workspace: &WorkspaceEnv,
) -> Result<Vec<BlameEntry>> {
    let repo = authorized_repo_root(registry, repo_root, workspace)?;
    ensure_git_available(&repo.workspace)?;
    let output = run_git(
        &repo.workspace,
        Some(&repo.git_path),
        ["blame", "--porcelain", file_path],
        DEFAULT_TIMEOUT_SECS,
    )?;
    ensure_success(&output, "blame failed")?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut entries: Vec<BlameEntry> = Vec::new();
    let mut current_sha = String::new();
    let mut current_author = String::new();
    let mut current_date = String::new();
    let mut current_line: u32 = 0;

    for line in stdout.lines() {
        if let Some(content) = line.strip_prefix('\t') {
            // Content line
            entries.push(BlameEntry {
                sha: current_sha.clone(),
                author: current_author.clone(),
                date: current_date.clone(),
                line_number: current_line,
                content: content.to_string(),
            });
        } else if let Some(rest) = line.strip_prefix("author ") {
            current_author = rest.to_string();
        } else if let Some(rest) = line.strip_prefix("author-time ") {
            current_date = rest.to_string();
        } else if line.len() >= 40 && line.chars().take(40).all(|c| c.is_ascii_hexdigit()) {
            // SHA line: "<sha> <orig_line> <final_line> [<num_lines>]"
            let parts: Vec<&str> = line.split_whitespace().collect();
            current_sha = parts[0][..8].to_string(); // short sha
            if parts.len() >= 3 {
                current_line = parts[2].parse().unwrap_or(0);
            }
        }
    }
    Ok(entries)
}

// ─── Init / Clone ────────────────────────────────────────────────────────────

pub fn init_repo(
    registry: &WorkspaceRegistry,
    path: &str,
    workspace: &WorkspaceEnv,
) -> Result<()> {
    let repo = authorized_repo_root(registry, path, workspace)?;
    ensure_git_available(&repo.workspace)?;
    let output = run_git(
        &repo.workspace,
        Some(&repo.git_path),
        ["init"],
        DEFAULT_TIMEOUT_SECS,
    )?;
    ensure_success(&output, "git init failed")?;
    Ok(())
}

pub fn clone_repo(
    registry: &WorkspaceRegistry,
    url: &str,
    target_dir: &str,
    workspace: &WorkspaceEnv,
) -> Result<()> {
    // For clone, we authorize the parent directory
    let parent = std::path::Path::new(target_dir)
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| target_dir.to_string());
    let repo = authorized_repo_root(registry, &parent, workspace)?;
    ensure_git_available(&repo.workspace)?;
    let output = run_git(
        &repo.workspace,
        Some(&repo.git_path),
        ["clone", url, target_dir],
        NETWORK_TIMEOUT_SECS,
    )?;
    ensure_success(&output, "git clone failed")?;
    Ok(())
}
