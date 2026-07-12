use crate::modules::acp::session::{AcpEvent, SessionManager};
use crate::modules::acp::types::*;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::Mutex;

/// ACP state managed by Tauri
pub struct AcpState {
    pub manager: Arc<Mutex<SessionManager>>,
    pub event_rx: Arc<Mutex<Option<tokio::sync::mpsc::UnboundedReceiver<AcpEvent>>>>,
}

impl Default for AcpState {
    fn default() -> Self {
        let (manager, event_rx) = SessionManager::new();
        Self {
            manager: Arc::new(Mutex::new(manager)),
            event_rx: Arc::new(Mutex::new(Some(event_rx))),
        }
    }
}

/// Start the event forwarding loop (called once from setup)
pub fn start_event_forwarding(app: &AppHandle, state: &AcpState) {
    let app_handle = app.clone();
    let event_rx_arc = state.event_rx.clone();

    tokio::spawn(async move {
        let mut rx_guard = event_rx_arc.lock().await;
        if let Some(mut rx) = rx_guard.take() {
            while let Some(event) = rx.recv().await {
                let _ = app_handle.emit("acp-event", &event);
            }
        }
    });
}

// ─── Tauri Commands ──────────────────────────────────────────────────────────

#[tauri::command]
pub async fn acp_set_configs(
    state: State<'_, AcpState>,
    configs: Vec<AgentConfig>,
) -> Result<(), String> {
    let manager = state.manager.lock().await;
    manager.set_configs(configs).await;
    Ok(())
}

#[tauri::command]
pub async fn acp_get_configs(
    state: State<'_, AcpState>,
) -> Result<Vec<AgentConfig>, String> {
    let manager = state.manager.lock().await;
    Ok(manager.get_configs().await)
}

#[tauri::command]
pub async fn acp_connect(
    state: State<'_, AcpState>,
    agent_name: String,
    workspace_roots: Vec<WorkspaceRoot>,
) -> Result<(), String> {
    let manager = state.manager.lock().await;
    manager
        .connect(&agent_name, workspace_roots)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn acp_disconnect(
    state: State<'_, AcpState>,
    agent_name: String,
) -> Result<(), String> {
    let manager = state.manager.lock().await;
    manager.disconnect(&agent_name).await;
    Ok(())
}

#[tauri::command]
pub async fn acp_new_session(
    state: State<'_, AcpState>,
    agent_name: String,
    model: Option<String>,
) -> Result<NewSessionResult, String> {
    let manager = state.manager.lock().await;
    manager
        .new_session(&agent_name, model)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn acp_prompt(
    state: State<'_, AcpState>,
    agent_name: String,
    session_id: String,
    content: String,
) -> Result<(), String> {
    let manager = state.manager.lock().await;
    manager
        .prompt(&agent_name, &session_id, &content)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn acp_cancel(
    state: State<'_, AcpState>,
    agent_name: String,
    session_id: String,
) -> Result<(), String> {
    let manager = state.manager.lock().await;
    manager
        .cancel(&agent_name, &session_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn acp_connected_agents(
    state: State<'_, AcpState>,
) -> Result<Vec<String>, String> {
    let manager = state.manager.lock().await;
    Ok(manager.connected_agents().await)
}

#[tauri::command]
pub async fn acp_is_connected(
    state: State<'_, AcpState>,
    agent_name: String,
) -> Result<bool, String> {
    let manager = state.manager.lock().await;
    Ok(manager.is_connected(&agent_name).await)
}
