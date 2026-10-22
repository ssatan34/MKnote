use std::time::{Duration, Instant};

use tauri::{Manager, Runtime, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::{load_config, QuickPocketWindowState, WindowGeometry};

pub const DEFAULT_QUICK_POCKET_ID: &str = "default";
const FOCUS_SETTLE_DELAY: Duration = Duration::from_millis(150);
const FOREGROUND_POLL_INTERVAL: Duration = Duration::from_millis(50);
const DEFAULT_WIDTH: f64 = 440.0;
const DEFAULT_HEIGHT: f64 = 560.0;
const MIN_WIDTH: f64 = 360.0;
const MIN_HEIGHT: f64 = 320.0;

#[derive(Clone, Debug)]
struct MonitorFrame {
    name: Option<String>,
    physical_x: i32,
    physical_y: i32,
    physical_width: u32,
    physical_height: u32,
    scale: f64,
}

#[derive(Clone, Debug, PartialEq)]
struct WindowPlacement {
    physical_x: i32,
    physical_y: i32,
    logical_width: f64,
    logical_height: f64,
}

fn resolve_placement(
    saved: Option<&WindowGeometry>,
    saved_monitor_name: Option<&str>,
    monitors: &[MonitorFrame],
    anchor_index: usize,
) -> WindowPlacement {
    let fallback = MonitorFrame {
        name: None,
        physical_x: 0,
        physical_y: 0,
        physical_width: 1920,
        physical_height: 1080,
        scale: 1.0,
    };
    let target = saved_monitor_name
        .and_then(|name| {
            monitors
                .iter()
                .find(|monitor| monitor.name.as_deref() == Some(name))
        })
        .or_else(|| monitors.get(anchor_index))
        .or_else(|| monitors.first())
        .unwrap_or(&fallback);
    let logical_width = target.physical_width as f64 / target.scale;
    let logical_height = target.physical_height as f64 / target.scale;
    let width = saved
        .map(|geometry| geometry.width)
        .unwrap_or(DEFAULT_WIDTH)
        .clamp(MIN_WIDTH.min(logical_width), logical_width);
    let height = saved
        .map(|geometry| geometry.height)
        .unwrap_or(DEFAULT_HEIGHT)
        .clamp(MIN_HEIGHT.min(logical_height), logical_height);
    let x = saved
        .map(|geometry| geometry.x)
        .unwrap_or((logical_width - width).max(0.0) / 2.0)
        .clamp(0.0, (logical_width - width).max(0.0));
    let y = saved
        .map(|geometry| geometry.y)
        .unwrap_or((logical_height - height).max(0.0) / 2.0)
        .clamp(0.0, (logical_height - height).max(0.0));
    WindowPlacement {
        physical_x: target.physical_x + (x * target.scale).round() as i32,
        physical_y: target.physical_y + (y * target.scale).round() as i32,
        logical_width: width,
        logical_height: height,
    }
}

fn monitor_frame(monitor: &tauri::Monitor) -> MonitorFrame {
    let position = monitor.position();
    let size = monitor.size();
    MonitorFrame {
        name: monitor.name().cloned(),
        physical_x: position.x,
        physical_y: position.y,
        physical_width: size.width,
        physical_height: size.height,
        scale: monitor.scale_factor(),
    }
}

fn window_label(pocket_id: &str) -> String {
    format!("quick-pocket-{pocket_id}")
}

fn state_for(config: &crate::AppConfig, pocket_id: &str) -> QuickPocketWindowState {
    if pocket_id == DEFAULT_QUICK_POCKET_ID {
        return QuickPocketWindowState {
            pocket_id: pocket_id.to_string(),
            geometry: config.quick_pocket_geometry.clone(),
            monitor_name: config.quick_pocket_monitor_name.clone(),
            always_on_top: config.quick_pocket_always_on_top,
            locked: config.quick_pocket_locked,
        };
    }
    config
        .quick_pocket_window_states
        .iter()
        .find(|state| state.pocket_id == pocket_id)
        .cloned()
        .unwrap_or(QuickPocketWindowState {
            pocket_id: pocket_id.to_string(),
            geometry: None,
            monitor_name: None,
            always_on_top: false,
            locked: false,
        })
}

fn save_state(config: &mut crate::AppConfig, state: QuickPocketWindowState) {
    if state.pocket_id == DEFAULT_QUICK_POCKET_ID {
        config.quick_pocket_geometry = state.geometry;
        config.quick_pocket_monitor_name = state.monitor_name;
        config.quick_pocket_always_on_top = state.always_on_top;
        config.quick_pocket_locked = state.locked;
        return;
    }
    if let Some(current) = config
        .quick_pocket_window_states
        .iter_mut()
        .find(|current| current.pocket_id == state.pocket_id)
    {
        *current = state;
    } else {
        config.quick_pocket_window_states.push(state);
    }
}

fn validate_pocket(config: &crate::AppConfig, pocket_id: &str) -> Result<(), String> {
    if pocket_id == DEFAULT_QUICK_POCKET_ID
        || config
            .quick_pockets
            .iter()
            .any(|pocket| pocket.id == pocket_id)
    {
        Ok(())
    } else {
        Err("Quick Pocket 不存在，请刷新后重试".to_string())
    }
}

fn resolved_runtime_placement<R: Runtime>(
    app: &tauri::AppHandle<R>,
    pocket_id: &str,
) -> WindowPlacement {
    let Some(main) = app.get_webview_window(crate::system::WINDOW_LABEL) else {
        return resolve_placement(None, None, &[], 0);
    };
    let monitors: Vec<MonitorFrame> = main
        .available_monitors()
        .unwrap_or_default()
        .iter()
        .map(monitor_frame)
        .collect();
    let anchor_name = main
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| main.primary_monitor().ok().flatten())
        .and_then(|monitor| monitor.name().cloned());
    let anchor_index = anchor_name
        .as_deref()
        .and_then(|name| {
            monitors
                .iter()
                .position(|monitor| monitor.name.as_deref() == Some(name))
        })
        .unwrap_or(0);
    let config = load_config().unwrap_or_default();
    let state = state_for(&config, pocket_id);
    resolve_placement(
        state.geometry.as_ref(),
        state.monitor_name.as_deref(),
        &monitors,
        anchor_index,
    )
}

fn current_geometry<R: Runtime>(
    window: &WebviewWindow<R>,
) -> Result<(WindowGeometry, Option<String>), String> {
    let position = window.outer_position().map_err(|error| error.to_string())?;
    let size = window.inner_size().map_err(|error| error.to_string())?;
    let monitor = window
        .current_monitor()
        .map_err(|error| error.to_string())?;
    let scale = monitor
        .as_ref()
        .map(|monitor| monitor.scale_factor())
        .unwrap_or(window.scale_factor().map_err(|error| error.to_string())?);
    let origin = monitor.as_ref().map(|monitor| monitor.position());
    let geometry = WindowGeometry {
        x: (position.x - origin.map(|value| value.x).unwrap_or(0)) as f64 / scale,
        y: (position.y - origin.map(|value| value.y).unwrap_or(0)) as f64 / scale,
        width: size.width as f64 / scale,
        height: size.height as f64 / scale,
    };
    Ok((
        geometry,
        monitor.and_then(|monitor| monitor.name().cloned()),
    ))
}

fn save_geometry<R: Runtime>(window: &WebviewWindow<R>, pocket_id: &str) -> Result<(), String> {
    let (geometry, monitor_name) = current_geometry(window)?;
    crate::update_config(|config| {
        let mut state = state_for(config, pocket_id);
        state.geometry = Some(geometry);
        state.monitor_name = monitor_name;
        save_state(config, state);
        Ok(())
    })
    .map(|_| ())
}

fn save_and_hide<R: Runtime>(window: &WebviewWindow<R>, pocket_id: &str) -> Result<(), String> {
    let save_result = save_geometry(window, pocket_id);
    let hide_result = window.hide().map_err(|error| error.to_string());
    match (save_result, hide_result) {
        (Ok(()), Ok(())) => Ok(()),
        (Err(save_error), Ok(())) => Err(format!(
            "Quick Pocket 已隐藏，但保存窗口位置失败：{save_error}"
        )),
        (Ok(()), Err(hide_error)) => Err(format!("隐藏 Quick Pocket 失败：{hide_error}")),
        (Err(save_error), Err(hide_error)) => Err(format!(
            "保存 Quick Pocket 窗口位置失败：{save_error}；隐藏失败：{hide_error}"
        )),
    }
}

/// 原生焦点回调在不同窗口操作下不稳定，因此按原生前台状态持续判定。
fn start_foreground_monitor<R: Runtime>(window: WebviewWindow<R>, pocket_id: String) {
    std::thread::spawn(move || {
        let mut was_foreground = false;
        let mut unfocused_since: Option<Instant> = None;
        loop {
            std::thread::sleep(FOREGROUND_POLL_INTERVAL);
            if !crate::win_present::is_native_presented(&window) {
                was_foreground = false;
                unfocused_since = None;
                continue;
            }
            if crate::win_present::is_native_foreground(&window) {
                was_foreground = true;
                unfocused_since = None;
                continue;
            }
            if !was_foreground {
                continue;
            }
            let since = unfocused_since.get_or_insert_with(Instant::now);
            if since.elapsed() >= FOCUS_SETTLE_DELAY {
                if let Err(error) = save_and_hide(&window, &pocket_id) {
                    eprintln!("{error}");
                }
                was_foreground = false;
                unfocused_since = None;
            }
        }
    });
}

#[tauri::command]
pub async fn open_quick_pocket_window(
    app: tauri::AppHandle,
    pocket_id: String,
) -> Result<(), String> {
    open_quick_pocket_window_for_runtime(app, pocket_id).await
}

#[tauri::command]
pub fn get_quick_pocket_window_state(pocket_id: String) -> Result<QuickPocketWindowState, String> {
    let config = load_config()?;
    validate_pocket(&config, &pocket_id)?;
    Ok(state_for(&config, &pocket_id))
}

pub async fn open_quick_pocket_window_for_runtime<R: Runtime>(
    app: tauri::AppHandle<R>,
    pocket_id: String,
) -> Result<(), String> {
    let config = load_config()?;
    validate_pocket(&config, &pocket_id)?;
    let placement = resolved_runtime_placement(&app, &pocket_id);
    let label = window_label(&pocket_id);
    let state = state_for(&config, &pocket_id);
    if let Some(window) = app.get_webview_window(&label) {
        if !window.is_visible().unwrap_or(false) {
            window
                .set_size(tauri::LogicalSize::new(
                    placement.logical_width,
                    placement.logical_height,
                ))
                .map_err(|error| error.to_string())?;
            window
                .set_position(tauri::PhysicalPosition::new(
                    placement.physical_x,
                    placement.physical_y,
                ))
                .map_err(|error| error.to_string())?;
        }
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
        return Ok(());
    }
    let window = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App("/".into()))
        .title(format!(
            "Quick Pocket · {}",
            if pocket_id == DEFAULT_QUICK_POCKET_ID {
                "默认"
            } else {
                &pocket_id
            }
        ))
        .inner_size(placement.logical_width, placement.logical_height)
        .min_inner_size(MIN_WIDTH, MIN_HEIGHT)
        .decorations(false)
        .transparent(false)
        .always_on_top(state.always_on_top)
        .resizable(!state.locked)
        .skip_taskbar(true)
        .visible(false)
        .build()
        .map_err(|error| error.to_string())?;
    window
        .set_position(tauri::PhysicalPosition::new(
            placement.physical_x,
            placement.physical_y,
        ))
        .map_err(|error| error.to_string())?;
    let window_for_events = window.clone();
    let pocket_id_for_events = pocket_id.clone();
    window.on_window_event(move |event| match event {
        tauri::WindowEvent::CloseRequested { api, .. } => {
            api.prevent_close();
            if let Err(error) = save_and_hide(&window_for_events, &pocket_id_for_events) {
                eprintln!("{error}");
            }
        }
        _ => {}
    });
    start_foreground_monitor(window.clone(), pocket_id);
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())
}

pub async fn toggle_quick_pocket_window_for_runtime<R: Runtime>(
    app: tauri::AppHandle<R>,
    pocket_id: String,
) -> Result<(), String> {
    let label = window_label(&pocket_id);
    if let Some(window) = app.get_webview_window(&label) {
        if window.is_visible().unwrap_or(false) {
            return save_and_hide(&window, &pocket_id);
        }
    }
    open_quick_pocket_window_for_runtime(app, pocket_id).await
}

#[tauri::command]
pub async fn toggle_quick_pocket_window(
    app: tauri::AppHandle,
    pocket_id: String,
) -> Result<(), String> {
    toggle_quick_pocket_window_for_runtime(app, pocket_id).await
}

#[tauri::command]
pub fn hide_quick_pocket_window<R: Runtime>(
    app: tauri::AppHandle<R>,
    pocket_id: String,
) -> Result<(), String> {
    app.get_webview_window(&window_label(&pocket_id))
        .map(|window| save_and_hide(&window, &pocket_id))
        .unwrap_or(Ok(()))
}

#[tauri::command]
pub fn set_quick_pocket_always_on_top<R: Runtime>(
    app: tauri::AppHandle<R>,
    pocket_id: String,
    enabled: bool,
) -> Result<(), String> {
    let previous = crate::update_config_with(|config| {
        validate_pocket(config, &pocket_id)?;
        let mut state = state_for(config, &pocket_id);
        let previous = state.always_on_top;
        state.always_on_top = enabled;
        save_state(config, state);
        Ok(previous)
    })
    .map(|(_, previous)| previous)?;
    if let Some(window) = app.get_webview_window(&window_label(&pocket_id)) {
        if let Err(error) = window.set_always_on_top(enabled) {
            crate::update_config(|config| {
                let mut rollback = state_for(config, &pocket_id);
                rollback.always_on_top = previous;
                save_state(config, rollback);
                Ok(())
            })
            .map_err(|rollback| {
                format!("设置 Quick Pocket 置顶失败：{error}；回滚配置失败：{rollback}")
            })?;
            return Err(error.to_string());
        }
    }
    Ok(())
}

#[tauri::command]
pub fn set_quick_pocket_locked<R: Runtime>(
    app: tauri::AppHandle<R>,
    pocket_id: String,
    enabled: bool,
) -> Result<(), String> {
    let previous = crate::update_config_with(|config| {
        validate_pocket(config, &pocket_id)?;
        let mut state = state_for(config, &pocket_id);
        let previous = state.locked;
        state.locked = enabled;
        save_state(config, state);
        Ok(previous)
    })
    .map(|(_, previous)| previous)?;
    if let Some(window) = app.get_webview_window(&window_label(&pocket_id)) {
        if let Err(error) = window.set_resizable(!enabled) {
            crate::update_config(|config| {
                let mut rollback = state_for(config, &pocket_id);
                rollback.locked = previous;
                save_state(config, rollback);
                Ok(())
            })
            .map_err(|rollback| {
                format!("设置 Quick Pocket 窗口锁定失败：{error}；回滚配置失败：{rollback}")
            })?;
            return Err(error.to_string());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{resolve_placement, MonitorFrame};
    use crate::{AppConfig, WindowGeometry};

    #[test]
    fn quick_pocket_defaults_match_design() {
        assert!(!AppConfig::default().quick_pocket_always_on_top);
        assert!(!AppConfig::default().quick_pocket_locked);
    }

    #[test]
    fn missing_geometry_uses_pocket_size() {
        let monitor = MonitorFrame {
            name: Some("primary".into()),
            physical_x: 0,
            physical_y: 0,
            physical_width: 1920,
            physical_height: 1080,
            scale: 1.0,
        };
        let placement = resolve_placement(None, None, &[monitor], 0);
        assert_eq!(placement.logical_width, 440.0);
        assert_eq!(placement.logical_height, 560.0);
    }

    #[test]
    fn saved_geometry_is_clamped_and_dpi_aware() {
        let monitor = MonitorFrame {
            name: Some("right".into()),
            physical_x: 1920,
            physical_y: 0,
            physical_width: 2560,
            physical_height: 1440,
            scale: 1.5,
        };
        let saved = WindowGeometry {
            x: 5000.0,
            y: -30.0,
            width: 200.0,
            height: 1800.0,
        };
        let placement = resolve_placement(Some(&saved), Some("right"), &[monitor], 0);
        assert_eq!(placement.logical_width, 360.0);
        assert_eq!(placement.logical_height, 960.0);
        assert_eq!(placement.physical_x, 3940);
        assert_eq!(placement.physical_y, 0);
    }

    #[test]
    fn tiny_monitor_never_reverses_window_size_clamp_bounds() {
        let monitor = MonitorFrame {
            name: Some("tiny".into()),
            physical_x: 0,
            physical_y: 0,
            physical_width: 320,
            physical_height: 240,
            scale: 1.0,
        };

        let placement = resolve_placement(None, None, &[monitor], 0);

        assert_eq!(placement.logical_width, 320.0);
        assert_eq!(placement.logical_height, 240.0);
    }
}
