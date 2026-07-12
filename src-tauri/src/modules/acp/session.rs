use crate::modules::acp::transport::{StdioTransport, TransportError, TransportResult};
use crate::modules::acp::types::*;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{mpsc, RwLock};

/// Manages ACP agent connections and sessions
pub struct SessionManager {
    /// Active agent transports keyed by agent name
    agents: Arc<RwLock<HashMap<String, AgentHandle>>>,
    /// Available agent configurations
    configs: Arc<RwLock<Vec<AgentConfig>>>,
    /// Event sender for forwarding notifications to frontend
    event_tx: mpsc::UnboundedSender<AcpEvent>,
}

/// Handle to a connected agent
struct AgentHandle {
    transport: Arc<StdioTransport>,
    sessions: Vec<String>,
    _notification_task: tokio::task::JoinHandle<()>,
}

/// Events emitted to the frontend
#[derive(Debug, Clone, serde::Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum AcpEvent {
    /// Agent connected and initialized
    AgentConnected {
        agent_name: String,
        agent_info: Option<AgentInfo>,
    },
    /// Agent disconnected
    AgentDisconnected {
        agent_name: String,
        reason: String,
    },
    /// Session update (streamed messages from agent)
    SessionUpdate {
        agent_name: String,
        session_id: String,
        messages: Option<Vec<Message>>,
        stop_reason: Option<String>,
    },
    /// Permission request from agent
    PermissionRequest {
        agent_name: String,
        session_id: String,
        permission_id: String,
        description: String,
    },
    /// Error event
    Error {
        agent_name: String,
        message: String,
    },
}

impl SessionManager {
    pub fn new() -> (Self, mpsc::UnboundedReceiver<AcpEvent>) {
        let (event_tx, event_rx) = mpsc::unbounded_channel();
        (
            Self {
                agents: Arc::new(RwLock::new(HashMap::new())),
                configs: Arc::new(RwLock::new(Vec::new())),
                event_tx,
            },
            event_rx,
        )
    }

    /// Update agent configurations
    pub async fn set_configs(&self, configs: Vec<AgentConfig>) {
        let mut guard = self.configs.write().await;
        *guard = configs;
    }

    /// Get current agent configurations
    pub async fn get_configs(&self) -> Vec<AgentConfig> {
        self.configs.read().await.clone()
    }

    /// Connect to an agent by name, spawning its process and performing initialize
    pub async fn connect(
        &self,
        agent_name: &str,
        workspace_roots: Vec<WorkspaceRoot>,
    ) -> TransportResult<()> {
        // Find config
        let configs = self.configs.read().await;
        let config = configs
            .iter()
            .find(|c| c.name == agent_name)
            .ok_or_else(|| TransportError::ProtocolError(format!("agent not found: {}", agent_name)))?
            .clone();
        drop(configs);

        // Determine cwd from first workspace root
        let cwd = workspace_roots
            .first()
            .map(|r| r.uri.strip_prefix("file:///").unwrap_or(&r.uri))
            .map(|s| s.replace('/', "\\"));

        // Spawn transport
        let (transport, mut notification_rx) =
            StdioTransport::spawn(&config, cwd.as_deref())?;

        let transport = Arc::new(transport);

        // Perform initialize handshake
        let init_params = InitializeParams {
            protocol_version: "2025-11-16".into(),
            capabilities: ClientCapabilities {
                workspace: Some(WorkspaceCapability {
                    roots: workspace_roots,
                }),
            },
            client_info: ClientInfo {
                name: "aterax".into(),
                version: env!("CARGO_PKG_VERSION").into(),
            },
        };

        let result = transport
            .request(
                "initialize",
                Some(serde_json::to_value(&init_params).unwrap()),
            )
            .await?;

        let init_result: InitializeResult = serde_json::from_value(result)
            .map_err(|e| TransportError::ProtocolError(format!("invalid initialize response: {}", e)))?;

        let agent_info = init_result.agent_info.clone();

        // Store agent info
        {
            let mut guard = transport.agent_info.lock().unwrap();
            *guard = agent_info.clone();
        }

        // Start notification forwarding task
        let event_tx = self.event_tx.clone();
        let agent_name_owned = agent_name.to_string();
        let notification_task = tokio::spawn(async move {
            while let Some(msg) = notification_rx.recv().await {
                let method = msg.method.as_deref().unwrap_or("");
                let params = msg.params.clone().unwrap_or(serde_json::Value::Null);

                match method {
                    "session/update" => {
                        if let Ok(update) = serde_json::from_value::<SessionUpdateParams>(params) {
                            let _ = event_tx.send(AcpEvent::SessionUpdate {
                                agent_name: agent_name_owned.clone(),
                                session_id: update.session_id,
                                messages: update.messages,
                                stop_reason: update.stop_reason,
                            });
                        }
                    }
                    "session/request_permission" => {
                        if let Ok(perm) = serde_json::from_value::<PermissionRequest>(params) {
                            let _ = event_tx.send(AcpEvent::PermissionRequest {
                                agent_name: agent_name_owned.clone(),
                                session_id: perm.session_id,
                                permission_id: perm.permission_id,
                                description: perm.description,
                            });
                        }
                    }
                    _ => {
                        // Unknown notification — log and skip
                        eprintln!("[acp] unknown notification: {}", method);
                    }
                }
            }

            // Agent disconnected
            let _ = event_tx.send(AcpEvent::AgentDisconnected {
                agent_name: agent_name_owned,
                reason: "process exited".into(),
            });
        });

        // Store handle
        let handle = AgentHandle {
            transport,
            sessions: Vec::new(),
            _notification_task: notification_task,
        };

        let mut agents = self.agents.write().await;
        agents.insert(agent_name.to_string(), handle);

        // Emit connected event
        let _ = self.event_tx.send(AcpEvent::AgentConnected {
            agent_name: agent_name.to_string(),
            agent_info,
        });

        Ok(())
    }

    /// Create a new session with a connected agent
    pub async fn new_session(
        &self,
        agent_name: &str,
        model: Option<String>,
    ) -> TransportResult<NewSessionResult> {
        let agents = self.agents.read().await;
        let handle = agents
            .get(agent_name)
            .ok_or(TransportError::NotRunning)?;

        let params = NewSessionParams { model };
        let result = handle
            .transport
            .request(
                "session/new",
                Some(serde_json::to_value(&params).unwrap()),
            )
            .await?;

        let session: NewSessionResult = serde_json::from_value(result)
            .map_err(|e| TransportError::ProtocolError(format!("invalid session/new response: {}", e)))?;

        drop(agents);

        // Track session
        let mut agents = self.agents.write().await;
        if let Some(handle) = agents.get_mut(agent_name) {
            handle.sessions.push(session.session_id.clone());
        }

        Ok(session)
    }

    /// Send a prompt to a session
    pub async fn prompt(
        &self,
        agent_name: &str,
        session_id: &str,
        content: &str,
    ) -> TransportResult<()> {
        let agents = self.agents.read().await;
        let handle = agents
            .get(agent_name)
            .ok_or(TransportError::NotRunning)?;

        let params = PromptParams {
            session_id: session_id.to_string(),
            messages: vec![Message {
                role: MessageRole::User,
                content: MessageContent::Text(content.to_string()),
            }],
        };

        // session/prompt is a request — the response comes when the turn is done
        // but updates stream via notifications
        handle
            .transport
            .request(
                "session/prompt",
                Some(serde_json::to_value(&params).unwrap()),
            )
            .await?;

        Ok(())
    }

    /// Cancel an ongoing prompt turn
    pub async fn cancel(
        &self,
        agent_name: &str,
        session_id: &str,
    ) -> TransportResult<()> {
        let agents = self.agents.read().await;
        let handle = agents
            .get(agent_name)
            .ok_or(TransportError::NotRunning)?;

        let params = CancelParams {
            session_id: session_id.to_string(),
        };

        handle
            .transport
            .notify(
                "session/cancel",
                Some(serde_json::to_value(&params).unwrap()),
            )?;

        Ok(())
    }

    /// Disconnect and kill an agent
    pub async fn disconnect(&self, agent_name: &str) {
        let mut agents = self.agents.write().await;
        if let Some(handle) = agents.remove(agent_name) {
            handle.transport.kill();
            handle._notification_task.abort();
        }
    }

    /// Disconnect all agents
    pub async fn disconnect_all(&self) {
        let mut agents = self.agents.write().await;
        for (_, handle) in agents.drain() {
            handle.transport.kill();
            handle._notification_task.abort();
        }
    }

    /// List connected agents
    pub async fn connected_agents(&self) -> Vec<String> {
        let agents = self.agents.read().await;
        agents.keys().cloned().collect()
    }

    /// Check if an agent is connected
    pub async fn is_connected(&self, agent_name: &str) -> bool {
        let agents = self.agents.read().await;
        agents.contains_key(agent_name)
    }
}
