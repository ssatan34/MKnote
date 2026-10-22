use crate::capture;
use crate::{load_config, AppConfig};
use serde::Deserialize;
use std::io::Read;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Runtime};
use uuid::Uuid;

struct ClipServerState {
    server: Arc<tiny_http::Server>,
    port: u16,
    token: String,
}

static CLIP_SERVER_STATE: Mutex<Option<ClipServerState>> = Mutex::new(None);

#[derive(Debug, Deserialize)]
struct ClipPayload {
    title: Option<String>,
    url: Option<String>,
    content: String,
}

pub fn start_clip_server<R: Runtime>(app: AppHandle<R>, port: u16) -> Result<u16, String> {
    let state = CLIP_SERVER_STATE.lock().map_err(|e| e.to_string())?;
    if let Some(existing) = state.as_ref() {
        if existing.port == port {
            return Ok(port);
        }
    }
    drop(state);

    let server = Arc::new(
        tiny_http::Server::http(format!("127.0.0.1:{port}"))
            .map_err(|error| format!("剪藏服务启动失败：{error}"))?,
    );
    let token = Uuid::new_v4().simple().to_string();

    let mut state = CLIP_SERVER_STATE.lock().map_err(|e| e.to_string())?;
    if let Some(existing) = state.take() {
        existing.server.unblock();
    }
    *state = Some(ClipServerState {
        server: Arc::clone(&server),
        port,
        token: token.clone(),
    });
    drop(state);

    let app_handle = app.clone();
    thread::spawn(move || {
        while let Ok(mut request) = server.recv() {
            let app = app_handle.clone();
            if !is_loopback_source(request.remote_addr().copied()) {
                let _ = request.respond(
                    tiny_http::Response::from_string("仅允许本机请求").with_status_code(403),
                );
                continue;
            }
            if request.method().as_str() == "OPTIONS" {
                let response = tiny_http::Response::empty(204);
                let _ = request.respond(response);
                continue;
            }
            if request.method().as_str() != "POST" || request.url() != "/clip" {
                let _ = request
                    .respond(tiny_http::Response::from_string("Not Found").with_status_code(404));
                continue;
            }
            let request_token = request
                .headers()
                .iter()
                .find(|header| header.field.equiv("X-MKnote-Clip-Token"))
                .map(|header| header.value.as_str());
            if !is_authorized_clip_request(request_token, &token) {
                let _ = request.respond(
                    tiny_http::Response::from_string("剪藏服务令牌无效").with_status_code(401),
                );
                continue;
            }
            const MAX_CLIP_BODY_BYTES: u64 = 1 * 1024 * 1024;
            if request
                .headers()
                .iter()
                .find(|header| header.field.equiv("Content-Length"))
                .and_then(|header| header.value.as_str().parse::<u64>().ok())
                .is_some_and(|length| length > MAX_CLIP_BODY_BYTES)
            {
                let _ = request
                    .respond(tiny_http::Response::from_string("请求体过大").with_status_code(413));
                continue;
            }
            let mut body = String::new();
            let mut limited = request.as_reader().take(MAX_CLIP_BODY_BYTES + 1);
            if limited.read_to_string(&mut body).is_err() || body.len() as u64 > MAX_CLIP_BODY_BYTES
            {
                let _ = request.respond(
                    tiny_http::Response::from_string("请求体过大或编码无效").with_status_code(413),
                );
                continue;
            }
            let result: Result<ClipPayload, _> = serde_json::from_str(&body);
            let response = match result {
                Ok(payload) => {
                    let title = payload.title.unwrap_or_else(|| "网页剪藏".to_string());
                    let url = payload.url.unwrap_or_default();
                    let md = if url.is_empty() {
                        format!("# {title}\n\n{content}", content = payload.content)
                    } else {
                        format!(
                            "# {title}\n\n来源：<{url}>\n\n{content}",
                            content = payload.content
                        )
                    };
                    match capture::quick_capture_create(&app, &md) {
                        Ok(note) => tiny_http::Response::from_string(
                            serde_json::json!({ "ok": true, "name": note.name }).to_string(),
                        )
                        .with_header(
                            tiny_http::Header::from_bytes("Content-Type", "application/json")
                                .unwrap(),
                        ),
                        Err(e) => {
                            tiny_http::Response::from_string(format!("{{\"error\":\"{e}\"}}"))
                                .with_status_code(500)
                        }
                    }
                }
                Err(e) => tiny_http::Response::from_string(format!("{{\"error\":\"{e}\"}}"))
                    .with_status_code(400),
            };
            let _ = request.respond(response);
        }
        if let Ok(mut state) = CLIP_SERVER_STATE.lock() {
            if state
                .as_ref()
                .is_some_and(|current| Arc::ptr_eq(&current.server, &server))
            {
                *state = None;
            }
        }
    });
    Ok(port)
}

pub fn stop_clip_server() -> Result<(), String> {
    let mut state = CLIP_SERVER_STATE.lock().map_err(|e| e.to_string())?;
    if let Some(existing) = state.take() {
        existing.server.unblock();
    }
    Ok(())
}

pub fn current_clip_server_token() -> Option<String> {
    CLIP_SERVER_STATE
        .lock()
        .ok()
        .and_then(|state| state.as_ref().map(|current| current.token.clone()))
}

fn is_authorized_clip_request(request_token: Option<&str>, expected_token: &str) -> bool {
    request_token == Some(expected_token)
}

fn is_loopback_source(source: Option<SocketAddr>) -> bool {
    source.is_some_and(|address| address.ip().is_loopback())
}

pub fn ensure_clip_server<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let config = load_config()?;
    if config.clip_server_enabled {
        start_clip_server(app.clone(), config.clip_server_port)?;
    }
    Ok(())
}

pub fn set_clip_server_enabled<R: Runtime>(
    app: &AppHandle<R>,
    enabled: bool,
    port: Option<u16>,
) -> Result<AppConfig, String> {
    if enabled {
        let current = load_config()?;
        let target_port = port.unwrap_or(current.clip_server_port);
        start_clip_server(app.clone(), target_port)?;
        return match crate::update_config(|config| {
            config.clip_server_enabled = true;
            config.clip_server_port = target_port;
            Ok(())
        }) {
            Ok(config) => Ok(config),
            Err(error) => {
                let _ = stop_clip_server();
                if current.clip_server_enabled {
                    if let Err(rollback_error) = start_clip_server(app.clone(), current.clip_server_port)
                    {
                        return Err(format!(
                            "保存剪藏服务配置失败：{error}；恢复原服务失败：{rollback_error}"
                        ));
                    }
                }
                Err(error)
            }
        };
    }

    let current = load_config()?;
    stop_clip_server()?;
    match crate::update_config(|config| {
        config.clip_server_enabled = false;
        if let Some(p) = port {
            config.clip_server_port = p;
        }
        Ok(())
    }) {
        Ok(config) => Ok(config),
        Err(error) => {
            if current.clip_server_enabled {
                if let Err(rollback_error) = start_clip_server(app.clone(), current.clip_server_port) {
                    return Err(format!(
                        "保存剪藏服务配置失败：{error}；恢复原服务失败：{rollback_error}"
                    ));
                }
            }
            Err(error)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::SocketAddr;

    #[test]
    fn clip_request_requires_exact_runtime_token() {
        assert!(!is_authorized_clip_request(None, "runtime-token"));
        assert!(!is_authorized_clip_request(
            Some("wrong-token"),
            "runtime-token"
        ));
        assert!(is_authorized_clip_request(
            Some("runtime-token"),
            "runtime-token"
        ));
    }

    #[test]
    fn clip_request_accepts_only_loopback_sources() {
        assert!(is_loopback_source(Some(
            "127.0.0.1:4321".parse::<SocketAddr>().unwrap()
        )));
        assert!(is_loopback_source(Some(
            "[::1]:4321".parse::<SocketAddr>().unwrap()
        )));
        assert!(!is_loopback_source(Some(
            "192.168.1.10:4321".parse::<SocketAddr>().unwrap()
        )));
        assert!(!is_loopback_source(None));
    }
}
