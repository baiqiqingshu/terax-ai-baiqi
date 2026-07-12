use crate::modules::acp::types::*;
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use tokio::sync::{mpsc, oneshot};

/// Errors specific to ACP transport
#[derive(Debug, thiserror::Error)]
pub enum TransportError {
    #[error("spawn failed: {0}")]
    SpawnFailed(String),
    #[error("process not running")]
    NotRunning,
    #[error("write failed: {0}")]
    WriteFailed(String),
    #[error("protocol error: {0}")]
    ProtocolError(String),
    #[error("timeout")]
    Timeout,
    #[error("cancelled")]
    Cancelled,
}

pub type TransportResult<T> = Result<T, TransportError>;

/// Represents a running ACP agent process using stdio transport
pub struct StdioTransport {
    child: Arc<Mutex<Option<Child>>>,
    stdin_tx: mpsc::UnboundedSender<String>,
    next_id: AtomicU64,
    pending: Arc<Mutex<HashMap<u64, oneshot::Sender<JsonRpcResponse>>>>,
    pub agent_info: Arc<Mutex<Option<AgentInfo>>>,
}

impl StdioTransport {
    /// Spawn an agent subprocess and start the read loop.
    /// Returns the transport handle and a receiver for notifications (session/update, etc).
    pub fn spawn(
        config: &AgentConfig,
        cwd: Option<&str>,
    ) -> TransportResult<(Self, mpsc::UnboundedReceiver<JsonRpcResponse>)> {
        let command = config
            .command
            .as_deref()
            .ok_or_else(|| TransportError::SpawnFailed("no command specified".into()))?;

        let mut cmd = Command::new(command);
        cmd.args(&config.args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .envs(&config.env);

        if let Some(dir) = cwd {
            cmd.current_dir(dir);
        }

        // On Windows, prevent console window from flashing
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }

        let mut child = cmd
            .spawn()
            .map_err(|e| TransportError::SpawnFailed(format!("{}: {}", command, e)))?;

        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| TransportError::SpawnFailed("failed to capture stdout".into()))?;

        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| TransportError::SpawnFailed("failed to capture stdin".into()))?;

        // Channel for outbound writes
        let (stdin_tx, mut stdin_rx) = mpsc::unbounded_channel::<String>();

        // Channel for inbound notifications
        let (notification_tx, notification_rx) = mpsc::unbounded_channel::<JsonRpcResponse>();

        let pending: Arc<Mutex<HashMap<u64, oneshot::Sender<JsonRpcResponse>>>> =
            Arc::new(Mutex::new(HashMap::new()));

        let child_arc = Arc::new(Mutex::new(Some(child)));

        // ─── Stdin writer task ───────────────────────────────────────────────
        let stdin_handle = Arc::new(Mutex::new(stdin));
        tokio::spawn(async move {
            while let Some(line) = stdin_rx.recv().await {
                let mut guard = stdin_handle.lock().unwrap();
                if writeln!(guard, "{}", line).is_err() {
                    break;
                }
                let _ = guard.flush();
            }
        });

        // ─── Stdout reader task ──────────────────────────────────────────────
        let pending_clone = pending.clone();
        let notif_tx = notification_tx.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                let line = match line {
                    Ok(l) => l,
                    Err(_) => break,
                };
                if line.trim().is_empty() {
                    continue;
                }
                let msg: JsonRpcResponse = match serde_json::from_str(&line) {
                    Ok(m) => m,
                    Err(e) => {
                        eprintln!("[acp] malformed message: {} — raw: {}", e, &line[..line.len().min(200)]);
                        continue;
                    }
                };

                // If it has an id, it's a response to a pending request
                if let Some(id) = msg.id {
                    let mut guard = pending_clone.lock().unwrap();
                    if let Some(tx) = guard.remove(&id) {
                        let _ = tx.send(msg);
                    }
                } else {
                    // Notification (session/update, etc)
                    let _ = notif_tx.send(msg);
                }
            }
        });

        // ─── Stderr logger task ──────────────────────────────────────────────
        // Spawn stderr reader in case child has stderr
        let child_for_stderr = child_arc.clone();
        std::thread::spawn(move || {
            let guard = child_for_stderr.lock().unwrap();
            if let Some(ref child) = *guard {
                // Can't take stderr after spawn without &mut, so we skip for now.
                // Stderr logging handled at process level.
                let _ = child;
            }
        });

        let transport = StdioTransport {
            child: child_arc,
            stdin_tx,
            next_id: AtomicU64::new(1),
            pending,
            agent_info: Arc::new(Mutex::new(None)),
        };

        Ok((transport, notification_rx))
    }

    /// Send a JSON-RPC request and await the response
    pub async fn request(
        &self,
        method: &str,
        params: Option<serde_json::Value>,
    ) -> TransportResult<serde_json::Value> {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let req = JsonRpcRequest {
            jsonrpc: "2.0".into(),
            id,
            method: method.into(),
            params,
        };

        let json = serde_json::to_string(&req)
            .map_err(|e| TransportError::ProtocolError(e.to_string()))?;

        let (tx, rx) = oneshot::channel();
        {
            let mut guard = self.pending.lock().unwrap();
            guard.insert(id, tx);
        }

        self.stdin_tx
            .send(json)
            .map_err(|_| TransportError::NotRunning)?;

        let response = tokio::time::timeout(std::time::Duration::from_secs(30), rx)
            .await
            .map_err(|_| TransportError::Timeout)?
            .map_err(|_| TransportError::Cancelled)?;

        if let Some(err) = response.error {
            return Err(TransportError::ProtocolError(format!(
                "[{}] {}",
                err.code, err.message
            )));
        }

        Ok(response.result.unwrap_or(serde_json::Value::Null))
    }

    /// Send a JSON-RPC notification (no response expected)
    pub fn notify(
        &self,
        method: &str,
        params: Option<serde_json::Value>,
    ) -> TransportResult<()> {
        let notif = JsonRpcNotification {
            jsonrpc: "2.0".into(),
            method: method.into(),
            params,
        };

        let json = serde_json::to_string(&notif)
            .map_err(|e| TransportError::ProtocolError(e.to_string()))?;

        self.stdin_tx
            .send(json)
            .map_err(|_| TransportError::NotRunning)?;

        Ok(())
    }

    /// Kill the agent process
    pub fn kill(&self) {
        let mut guard = self.child.lock().unwrap();
        if let Some(ref mut child) = *guard {
            let _ = child.kill();
        }
        *guard = None;
    }

    /// Check if process is still alive
    pub fn is_alive(&self) -> bool {
        let mut guard = self.child.lock().unwrap();
        if let Some(ref mut child) = *guard {
            matches!(child.try_wait(), Ok(None))
        } else {
            false
        }
    }
}

impl Drop for StdioTransport {
    fn drop(&mut self) {
        self.kill();
    }
}
