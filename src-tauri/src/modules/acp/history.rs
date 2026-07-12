//! ACP History — scans Codex CLI and Claude Code session history files.
//!
//! Codex CLI: ~/.codex/history/*.jsonl
//! Claude Code: ~/.claude/projects/<hash>/*.jsonl

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistorySession {
    pub id: String,
    pub agent: String, // "codex" | "claude-code"
    pub timestamp: u64, // ms
    pub preview: String,
    pub file_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub messages: Option<Vec<HistoryMessage>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryMessage {
    pub role: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<u64>,
}

/// Get the home directory
fn home_dir() -> Option<PathBuf> {
    dirs::home_dir()
}

/// Scan Codex CLI history directory
fn scan_codex_history() -> Vec<HistorySession> {
    let mut sessions = Vec::new();
    let Some(home) = home_dir() else {
        return sessions;
    };

    // Try ~/.codex/history/ and ~/.codex/sessions/
    for subdir in ["history", "sessions"] {
        let dir = home.join(".codex").join(subdir);
        if !dir.exists() {
            continue;
        }
        if let Ok(entries) = std::fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().map(|e| e == "jsonl" || e == "json").unwrap_or(false) {
                    if let Some(session) = parse_codex_session(&path) {
                        sessions.push(session);
                    }
                }
            }
        }
    }

    sessions
}

/// Parse a single Codex session file
fn parse_codex_session(path: &PathBuf) -> Option<HistorySession> {
    let content = std::fs::read_to_string(path).ok()?;
    let first_line = content.lines().next()?;

    // Try to parse first line as JSON to get preview
    let preview = if let Ok(val) = serde_json::from_str::<serde_json::Value>(first_line) {
        val.get("content")
            .or_else(|| val.get("message"))
            .or_else(|| val.get("input"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .chars()
            .take(100)
            .collect::<String>()
    } else {
        first_line.chars().take(100).collect()
    };

    let metadata = std::fs::metadata(path).ok()?;
    let timestamp = metadata
        .modified()
        .ok()?
        .duration_since(std::time::UNIX_EPOCH)
        .ok()?
        .as_millis() as u64;

    let id = format!(
        "codex-{}",
        path.file_stem()?.to_string_lossy()
    );

    Some(HistorySession {
        id,
        agent: "codex".into(),
        timestamp,
        preview,
        file_path: path.to_string_lossy().into_owned(),
        messages: None,
    })
}

/// Scan Claude Code history directory
fn scan_claude_history(project_root: Option<&str>) -> Vec<HistorySession> {
    let mut sessions = Vec::new();
    let Some(home) = home_dir() else {
        return sessions;
    };

    let claude_dir = home.join(".claude");
    if !claude_dir.exists() {
        return sessions;
    }

    // Claude Code stores under ~/.claude/projects/<hash>/ or directly
    let projects_dir = claude_dir.join("projects");
    let mut search_dirs: Vec<PathBuf> = Vec::new();

    if projects_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&projects_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    // Check if this project matches the project_root
                    if let Some(root) = project_root {
                        // The folder name is often a hash of the project path
                        // or contains a .project file with the actual path
                        let project_file = path.join(".project");
                        if project_file.exists() {
                            if let Ok(proj_path) = std::fs::read_to_string(&project_file) {
                                if !proj_path.trim().eq_ignore_ascii_case(root) {
                                    continue;
                                }
                            }
                        }
                    }
                    search_dirs.push(path);
                }
            }
        }
    }

    // Also check ~/.claude/ directly for session files
    search_dirs.push(claude_dir.clone());

    for dir in search_dirs {
        if let Ok(entries) = std::fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                let ext = path.extension().and_then(|e| e.to_str());
                if matches!(ext, Some("jsonl" | "json")) {
                    if let Some(session) = parse_claude_session(&path) {
                        sessions.push(session);
                    }
                }
            }
        }
    }

    sessions
}

/// Parse a single Claude Code session file
fn parse_claude_session(path: &PathBuf) -> Option<HistorySession> {
    let content = std::fs::read_to_string(path).ok()?;
    let first_line = content.lines().next()?;

    let preview = if let Ok(val) = serde_json::from_str::<serde_json::Value>(first_line) {
        // Claude Code format: {"type":"human","message":{"content":"..."}}
        val.get("message")
            .and_then(|m| m.get("content"))
            .or_else(|| val.get("content"))
            .or_else(|| val.get("text"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .chars()
            .take(100)
            .collect::<String>()
    } else {
        first_line.chars().take(100).collect()
    };

    if preview.is_empty() {
        return None;
    }

    let metadata = std::fs::metadata(path).ok()?;
    let timestamp = metadata
        .modified()
        .ok()?
        .duration_since(std::time::UNIX_EPOCH)
        .ok()?
        .as_millis() as u64;

    let id = format!(
        "claude-{}",
        path.file_stem()?.to_string_lossy()
    );

    Some(HistorySession {
        id,
        agent: "claude-code".into(),
        timestamp,
        preview,
        file_path: path.to_string_lossy().into_owned(),
        messages: None,
    })
}

/// Load full messages from a session file
fn load_session_messages(path: &str, agent: &str) -> Vec<HistoryMessage> {
    let Ok(content) = std::fs::read_to_string(path) else {
        return Vec::new();
    };

    let mut messages = Vec::new();

    for line in content.lines() {
        if line.trim().is_empty() {
            continue;
        }
        let Ok(val) = serde_json::from_str::<serde_json::Value>(line) else {
            continue;
        };

        let (role, text) = match agent {
            "codex" => {
                let role = val
                    .get("role")
                    .and_then(|r| r.as_str())
                    .unwrap_or("assistant")
                    .to_string();
                let text = val
                    .get("content")
                    .or_else(|| val.get("message"))
                    .or_else(|| val.get("output"))
                    .and_then(|v| {
                        if v.is_string() {
                            v.as_str().map(|s| s.to_string())
                        } else {
                            Some(v.to_string())
                        }
                    })
                    .unwrap_or_default();
                (role, text)
            }
            "claude-code" => {
                let msg_type = val
                    .get("type")
                    .and_then(|t| t.as_str())
                    .unwrap_or("");
                let role = match msg_type {
                    "human" => "user",
                    "assistant" => "assistant",
                    _ => {
                        if val.get("role").and_then(|r| r.as_str()) == Some("user") {
                            "user"
                        } else {
                            "assistant"
                        }
                    }
                }
                .to_string();
                let text = val
                    .get("message")
                    .and_then(|m| m.get("content"))
                    .or_else(|| val.get("content"))
                    .or_else(|| val.get("text"))
                    .and_then(|v| {
                        if v.is_string() {
                            v.as_str().map(|s| s.to_string())
                        } else if v.is_array() {
                            // Claude sometimes uses content blocks
                            let parts: Vec<String> = v
                                .as_array()
                                .unwrap()
                                .iter()
                                .filter_map(|p| {
                                    p.get("text").and_then(|t| t.as_str()).map(|s| s.to_string())
                                })
                                .collect();
                            Some(parts.join("\n"))
                        } else {
                            Some(v.to_string())
                        }
                    })
                    .unwrap_or_default();
                (role, text)
            }
            _ => continue,
        };

        if !text.is_empty() {
            messages.push(HistoryMessage {
                role,
                content: text,
                timestamp: None,
            });
        }
    }

    messages
}

// ─── Tauri Commands ──────────────────────────────────────────────────────────

#[tauri::command]
pub async fn acp_load_history(
    project_root: Option<String>,
) -> Result<Vec<HistorySession>, String> {
    let mut sessions = Vec::new();

    // Scan both Codex and Claude Code
    sessions.extend(scan_codex_history());
    sessions.extend(scan_claude_history(project_root.as_deref()));

    // Sort by timestamp descending (most recent first)
    sessions.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));

    // Limit to 100 most recent
    sessions.truncate(100);

    Ok(sessions)
}

#[tauri::command]
pub async fn acp_load_history_detail(
    file_path: String,
    agent: String,
) -> Result<HistorySession, String> {
    let path = PathBuf::from(&file_path);
    if !path.exists() {
        return Err("session file not found".into());
    }

    let messages = load_session_messages(&file_path, &agent);

    let metadata = std::fs::metadata(&path)
        .map_err(|e| e.to_string())?;
    let timestamp = metadata
        .modified()
        .map_err(|e| e.to_string())?
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis() as u64;

    let preview = messages
        .first()
        .map(|m| m.content.chars().take(100).collect::<String>())
        .unwrap_or_default();

    Ok(HistorySession {
        id: format!("{}-{}", agent, path.file_stem().unwrap_or_default().to_string_lossy()),
        agent,
        timestamp,
        preview,
        file_path,
        messages: Some(messages),
    })
}
