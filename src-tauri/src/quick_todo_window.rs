use std::time::{Duration, Instant};

use tauri::{Emitter, Manager, Runtime, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::{load_config, QuickTodoWindowState, WindowGeometry};

pub const QUICK_TODO_WINDOW_LABEL: &str = "quick-todo";
pub const QUICK_TODO_REMINDER_WINDOW_LABEL: &str = "quick-todo-reminder";
const FOCUS_SETTLE_DELAY: Duration = Duration::from_millis(150);
const FOREGROUND_POLL_INTERVAL: Duration = Duration::from_millis(50);
const DEFAULT_WIDTH: f64 = 440.0;
const DEFAULT_HEIGHT: f64 = 520.0;
const MIN_WIDTH: f64 = 360.0;
const MIN_HEIGHT: f64 = 320.0;
const REMINDER_WINDOW_WIDTH: f64 = 280.0;
const REMINDER_WINDOW_HEIGHT: f64 = 206.0;
const REMINDER_WINDOW_GAP: i32 = 8;

#[derive(Clone, Debug)]
pub struct MonitorFrame {
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

#[derive(Clone, Debug, PartialEq)]
pub struct ReminderPlacement {
    physical_x: i32,
    physical_y: i32,
}

pub fn resolve_reminder_placement(
    quick_position: (i32, i32),
    quick_size: (u32, u32),
    monitor: &MonitorFrame,
) -> ReminderPlacement {
    let reminder_width = (REMINDER_WINDOW_WIDTH * monitor.scale).round() as i32;
    let reminder_height = (REMINDER_WINDOW_HEIGHT * monitor.scale).round() as i32;
    let monitor_right = monitor.physical_x + monitor.physical_width as i32;
    let monitor_bottom = monitor.physical_y + monitor.physical_height as i32;
    let left_x = quick_position.0 - reminder_width - REMINDER_WINDOW_GAP;
    let right_x = quick_position.0 + quick_size.0 as i32 + REMINDER_WINDOW_GAP;
    let x = if left_x >= monitor.physical_x {
        left_x
    } else {
        clamp_position(right_x, monitor.physical_x, monitor_right - reminder_width)
    };
    let y = clamp_position(
        quick_position.1,
        monitor.physical_y,
        monitor_bottom - reminder_height,
    );

    ReminderPlacement {
        physical_x: x,
        physical_y: y,
    }
}

fn clamp_position(value: i32, min: i32, max: i32) -> i32 {
    if min > max {
        min
    } else {
        value.clamp(min, max)
    }
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
    let logical_monitor_width = target.physical_width as f64 / target.scale;
    let logical_monitor_height = target.physical_height as f64 / target.scale;
    let width = saved
        .map(|geometry| geometry.width)
        .unwrap_or(DEFAULT_WIDTH)
        .max(MIN_WIDTH)
        .min(logical_monitor_width);
    let height = saved
        .map(|geometry| geometry.height)
        .unwrap_or(DEFAULT_HEIGHT)
        .max(MIN_HEIGHT)
        .min(logical_monitor_height);
    let x = saved
        .map(|geometry| geometry.x)
        .unwrap_or((logical_monitor_width - width).max(0.0) / 2.0)
        .clamp(0.0, (logical_monitor_width - width).max(0.0));
    let y = saved
        .map(|geometry| geometry.y)
        .unwrap_or((logical_monitor_height - height).max(0.0) / 2.0)
        .clamp(0.0, (logical_monitor_height - height).max(0.0));

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

fn window_label(todo_id: &str) -> String {
    format!("{QUICK_TODO_WINDOW_LABEL}-{todo_id}")
}

fn reminder_window_label(todo_id: &str) -> String {
    format!("{QUICK_TODO_REMINDER_WINDOW_LABEL}-{todo_id}")
}

fn state_for(config: &crate::AppConfig, todo_id: &str) -> QuickTodoWindowState {
    if todo_id == crate::quick_todo::DEFAULT_QUICK_TODO_ID {
        return QuickTodoWindowState {
            todo_id: todo_id.to_string(),
            geometry: config.quick_todo_geometry.clone(),
            monitor_name: config.quick_todo_monitor_name.clone(),
            always_on_top: config.quick_todo_always_on_top,
            locked: config.quick_todo_locked,
        };
    }
    config
        .quick_todo_window_states
        .iter()
        .find(|state| state.todo_id == todo_id)
        .cloned()
        .unwrap_or(QuickTodoWindowState {
            todo_id: todo_id.to_string(),
            geometry: None,
            monitor_name: None,
            always_on_top: false,
            locked: false,
        })
}

fn persist_state(config: &mut crate::AppConfig, state: QuickTodoWindowState) {
    if state.todo_id == crate::quick_todo::DEFAULT_QUICK_TODO_ID {
        config.quick_todo_geometry = state.geometry;
        config.quick_todo_monitor_name = state.monitor_name;
        config.quick_todo_always_on_top = state.always_on_top;
        config.quick_todo_locked = state.locked;
        return;
    }
    if let Some(current) = config
        .quick_todo_window_states
        .iter_mut()
        .find(|current| current.todo_id == state.todo_id)
    {
        *current = state;
    } else {
        config.quick_todo_window_states.push(state);
    }
}

fn validate_todo(config: &crate::AppConfig, todo_id: &str) -> Result<(), String> {
    if todo_id == crate::quick_todo::DEFAULT_QUICK_TODO_ID
        || config.quick_todos.iter().any(|todo| todo.id == todo_id)
    {
        Ok(())
    } else {
        Err("Quick Todo 不存在，请刷新后重试".to_string())
    }
}

fn resolved_runtime_placement<R: Runtime>(
    app: &tauri::AppHandle<R>,
    todo_id: &str,
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
    let state = state_for(&config, todo_id);
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
    let monitor_position = monitor.as_ref().map(|monitor| monitor.position());
    let origin_x = monitor_position.map(|origin| origin.x).unwrap_or(0);
    let origin_y = monitor_position.map(|origin| origin.y).unwrap_or(0);
    let geometry = WindowGeometry {
        x: (position.x - origin_x) as f64 / scale,
        y: (position.y - origin_y) as f64 / scale,
        width: size.width as f64 / scale,
        height: size.height as f64 / scale,
    };
    Ok((
        geometry,
        monitor.and_then(|monitor| monitor.name().cloned()),
    ))
}

fn save_geometry<R: Runtime>(window: &WebviewWindow<R>, todo_id: &str) -> Result<(), String> {
    let (geometry, monitor_name) = current_geometry(window)?;
    crate::update_config(|config| {
        let mut state = state_for(config, todo_id);
        state.geometry = Some(geometry);
        state.monitor_name = monitor_name;
        persist_state(config, state);
        Ok(())
    })
    .map(|_| ())
}

fn reminder_runtime_placement<R: Runtime>(
    app: &tauri::AppHandle<R>,
    quick_todo: &WebviewWindow<R>,
) -> Result<ReminderPlacement, String> {
    let quick_position = quick_todo
        .outer_position()
        .map_err(|error| error.to_string())?;
    let quick_size = quick_todo.outer_size().map_err(|error| error.to_string())?;
    let monitor = quick_todo
        .current_monitor()
        .map_err(|error| error.to_string())?
        .or_else(|| app.primary_monitor().ok().flatten())
        .ok_or_else(|| "无法确定 Quick Todo 所在显示器".to_string())?;
    Ok(resolve_reminder_placement(
        (quick_position.x, quick_position.y),
        (quick_size.width, quick_size.height),
        &monitor_frame(&monitor),
    ))
}

fn hide_reminder_window<R: Runtime>(app: &tauri::AppHandle<R>, todo_id: &str) {
    if let Some(window) = app.get_webview_window(&reminder_window_label(todo_id)) {
        let _ = window.hide();
    }
}

fn save_and_hide<R: Runtime>(window: &WebviewWindow<R>, todo_id: &str) -> Result<(), String> {
    let save_result = save_geometry(window, todo_id);
    let hide_result = window.hide().map_err(|error| error.to_string());
    match (save_result, hide_result) {
        (Ok(()), Ok(())) => Ok(()),
        (Err(save_error), Ok(())) => Err(format!(
            "Quick Todo 已隐藏，但保存窗口位置失败：{save_error}"
        )),
        (Ok(()), Err(hide_error)) => Err(format!("隐藏 Quick Todo 失败：{hide_error}")),
        (Err(save_error), Err(hide_error)) => Err(format!(
            "保存 Quick Todo 窗口位置失败：{save_error}；隐藏失败：{hide_error}"
        )),
    }
}

/// 不能把 `Focused(false)` 作为唯一入口：Windows 非客户区缩放可能产生瞬态事件，
/// 同时 Tauri 也不会在每种原生焦点切换中转发该事件。
fn start_foreground_monitor<R: Runtime>(
    app: tauri::AppHandle<R>,
    window: WebviewWindow<R>,
    todo_id: String,
) {
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
            let reminder_is_foreground = app
                .get_webview_window(&reminder_window_label(&todo_id))
                .is_some_and(|reminder| crate::win_present::is_native_foreground(&reminder));
            if crate::win_present::is_native_foreground(&window) || reminder_is_foreground {
                was_foreground = true;
                unfocused_since = None;
                continue;
            }
            if !was_foreground {
                continue;
            }
            let since = unfocused_since.get_or_insert_with(Instant::now);
            if since.elapsed() >= FOCUS_SETTLE_DELAY {
                if let Err(error) = save_and_hide(&window, &todo_id) {
                    eprintln!("{error}");
                }
                hide_reminder_window(&app, &todo_id);
                was_foreground = false;
                unfocused_since = None;
            }
        }
    });
}

#[tauri::command]
pub async fn open_quick_todo_window(app: tauri::AppHandle, todo_id: String) -> Result<(), String> {
    open_quick_todo_window_for_runtime(app, todo_id).await
}

pub async fn open_quick_todo_window_for_runtime<R: Runtime>(
    app: tauri::AppHandle<R>,
    todo_id: String,
) -> Result<(), String> {
    let config = load_config()?;
    validate_todo(&config, &todo_id)?;
    let placement = resolved_runtime_placement(&app, &todo_id);
    let label = window_label(&todo_id);
    let state = state_for(&config, &todo_id);
    if let Some(window) = app.get_webview_window(&label) {
        let was_hidden = !window.is_visible().unwrap_or(false);
        if was_hidden {
            window
                .set_size(tauri::LogicalSize::new(
                    placement.logical_width,
                    placement.logical_height,
                ))
                .map_err(|e| e.to_string())?;
            window
                .set_position(tauri::PhysicalPosition::new(
                    placement.physical_x,
                    placement.physical_y,
                ))
                .map_err(|e| e.to_string())?;
        }
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    let title = if todo_id == crate::quick_todo::DEFAULT_QUICK_TODO_ID {
        "Quick Todo".to_string()
    } else {
        config
            .quick_todos
            .iter()
            .find(|todo| todo.id == todo_id)
            .map(|todo| todo.name.clone())
            .unwrap_or_else(|| todo_id.clone())
    };
    let window = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App("/".into()))
        .title(title)
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
    let app_for_events = app.clone();
    let todo_id_for_events = todo_id.clone();
    window.on_window_event(move |event| match event {
        tauri::WindowEvent::CloseRequested { api, .. } => {
            api.prevent_close();
            if let Err(error) = save_and_hide(&window_for_events, &todo_id_for_events) {
                eprintln!("{error}");
            }
            hide_reminder_window(&app_for_events, &todo_id_for_events);
        }
        _ => {}
    });
    start_foreground_monitor(app.clone(), window.clone(), todo_id);
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())?;
    Ok(())
}

pub async fn toggle_quick_todo_window_for_runtime<R: Runtime>(
    app: tauri::AppHandle<R>,
    todo_id: String,
) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&window_label(&todo_id)) {
        if window.is_visible().unwrap_or(false) {
            let result = save_and_hide(&window, &todo_id);
            hide_reminder_window(&app, &todo_id);
            return result;
        }
    }

    open_quick_todo_window_for_runtime(app, todo_id).await
}
#[tauri::command]
pub async fn toggle_quick_todo_window(
    app: tauri::AppHandle,
    todo_id: String,
) -> Result<(), String> {
    toggle_quick_todo_window_for_runtime(app, todo_id).await
}

#[tauri::command]
pub fn hide_quick_todo_window<R: Runtime>(
    app: tauri::AppHandle<R>,
    todo_id: String,
) -> Result<(), String> {
    let Some(window) = app.get_webview_window(&window_label(&todo_id)) else {
        return Ok(());
    };
    let result = save_and_hide(&window, &todo_id);
    hide_reminder_window(&app, &todo_id);
    result
}

#[tauri::command]
pub async fn open_quick_todo_reminder_window(
    app: tauri::AppHandle,
    todo_id: String,
    item_id: String,
) -> Result<(), String> {
    let label = reminder_window_label(&todo_id);
    let quick_todo = app
        .get_webview_window(&window_label(&todo_id))
        .ok_or_else(|| "Quick Todo 窗口未打开".to_string())?;
    let placement = reminder_runtime_placement(&app, &quick_todo)?;

    if let Some(window) = app.get_webview_window(&label) {
        window
            .emit(
                "mknote:quick-todo-reminder-open",
                serde_json::json!({ "todoId": todo_id, "itemId": item_id }),
            )
            .map_err(|error| error.to_string())?;
        window
            .set_position(tauri::PhysicalPosition::new(
                placement.physical_x,
                placement.physical_y,
            ))
            .map_err(|error| error.to_string())?;
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
        return Ok(());
    }

    let window = WebviewWindowBuilder::new(
        &app,
        &label,
        WebviewUrl::App(format!("/?todoId={todo_id}&itemId={item_id}").into()),
    )
    .title("设置提醒")
    .inner_size(REMINDER_WINDOW_WIDTH, REMINDER_WINDOW_HEIGHT)
    .decorations(false)
    .resizable(false)
    .always_on_top(true)
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

    window.on_window_event(|event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
        }
    });
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn hide_quick_todo_reminder_window<R: Runtime>(app: tauri::AppHandle<R>, todo_id: String) {
    hide_reminder_window(&app, &todo_id);
}

#[tauri::command]
pub fn get_quick_todo_window_state(todo_id: String) -> Result<QuickTodoWindowState, String> {
    let config = load_config()?;
    validate_todo(&config, &todo_id)?;
    Ok(state_for(&config, &todo_id))
}

#[tauri::command]
pub fn set_quick_todo_always_on_top<R: Runtime>(
    app: tauri::AppHandle<R>,
    todo_id: String,
    enabled: bool,
) -> Result<(), String> {
    let previous = crate::update_config_with(|config| {
        validate_todo(config, &todo_id)?;
        let mut state = state_for(config, &todo_id);
        let previous = state.always_on_top;
        state.always_on_top = enabled;
        persist_state(config, state);
        Ok(previous)
    })
    .map(|(_, previous)| previous)?;
    if let Some(window) = app.get_webview_window(&window_label(&todo_id)) {
        if let Err(error) = window.set_always_on_top(enabled) {
            let rollback = crate::update_config(|config| {
                let mut state = state_for(config, &todo_id);
                state.always_on_top = previous;
                persist_state(config, state);
                Ok(())
            })
            .map(|_| ());
            return match rollback {
                Ok(()) => Err(error.to_string()),
                Err(rollback_error) => Err(format!(
                    "设置 Quick Todo 置顶失败：{error}；回滚配置失败：{rollback_error}"
                )),
            };
        }
    }
    Ok(())
}

#[tauri::command]
pub fn set_quick_todo_locked<R: Runtime>(
    app: tauri::AppHandle<R>,
    todo_id: String,
    enabled: bool,
) -> Result<(), String> {
    let previous = crate::update_config_with(|config| {
        validate_todo(config, &todo_id)?;
        let mut state = state_for(config, &todo_id);
        let previous = state.locked;
        state.locked = enabled;
        persist_state(config, state);
        Ok(previous)
    })
    .map(|(_, previous)| previous)?;
    if let Some(window) = app.get_webview_window(&window_label(&todo_id)) {
        if let Err(error) = window.set_resizable(!enabled) {
            let rollback = crate::update_config(|config| {
                let mut state = state_for(config, &todo_id);
                state.locked = previous;
                persist_state(config, state);
                Ok(())
            })
            .map(|_| ());
            return match rollback {
                Ok(()) => Err(error.to_string()),
                Err(rollback_error) => Err(format!(
                    "设置 Quick Todo 窗口锁定失败：{error}；回滚配置失败：{rollback_error}"
                )),
            };
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        open_quick_todo_window, resolve_placement, resolve_reminder_placement, MonitorFrame,
    };
    use crate::{AppConfig, WindowGeometry};
    use std::future::Future;

    fn geom(x: f64, y: f64, width: f64, height: f64) -> WindowGeometry {
        WindowGeometry {
            x,
            y,
            width,
            height,
        }
    }

    #[test]
    fn quick_todo_pin_defaults_to_off() {
        assert!(!AppConfig::default().quick_todo_always_on_top);
    }

    #[test]
    fn quick_todo_lock_defaults_to_off() {
        assert!(!AppConfig::default().quick_todo_locked);
    }

    #[test]
    fn additional_todo_window_state_is_isolated_from_default() {
        let mut config = AppConfig::default();
        let mut work = super::state_for(&config, "todo_work");
        work.always_on_top = true;
        work.locked = true;
        super::persist_state(&mut config, work);
        assert!(!super::state_for(&config, "default").always_on_top);
        assert!(super::state_for(&config, "todo_work").always_on_top);
        assert!(super::state_for(&config, "todo_work").locked);
    }

    #[test]
    fn quick_todo_open_command_is_async_to_avoid_window_thread_deadlock() {
        fn assert_async_command<F, Fut>(_: F)
        where
            F: FnOnce(tauri::AppHandle, String) -> Fut,
            Fut: Future<Output = Result<(), String>>,
        {
        }

        assert_async_command(open_quick_todo_window);
    }

    #[test]
    fn missing_geometry_centers_on_anchor_monitor() {
        let monitor = MonitorFrame {
            name: Some("right".into()),
            physical_x: 1920,
            physical_y: 0,
            physical_width: 1920,
            physical_height: 1080,
            scale: 1.0,
        };

        let placement = resolve_placement(None, None, &[monitor], 0);

        assert_eq!(placement.physical_x, 2660);
        assert_eq!(placement.physical_y, 280);
    }

    #[test]
    fn missing_geometry_uses_full_quick_todo_panel_size() {
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
        assert_eq!(placement.logical_height, 520.0);
    }

    #[test]
    fn reminder_prefers_the_left_side_and_falls_back_to_the_right_at_the_screen_edge() {
        let monitor = MonitorFrame {
            name: Some("primary".into()),
            physical_x: 0,
            physical_y: 0,
            physical_width: 1920,
            physical_height: 1080,
            scale: 1.0,
        };

        let left = resolve_reminder_placement((700, 240), (440, 520), &monitor);
        let right = resolve_reminder_placement((20, 240), (440, 520), &monitor);

        assert_eq!(left.physical_x, 412);
        assert_eq!(left.physical_y, 240);
        assert_eq!(right.physical_x, 468);
        assert_eq!(right.physical_y, 240);
    }

    #[test]
    fn saved_logical_offset_is_clamped_inside_target_monitor() {
        let monitor = MonitorFrame {
            name: Some("primary".into()),
            physical_x: 0,
            physical_y: 0,
            physical_width: 1920,
            physical_height: 1080,
            scale: 1.0,
        };
        let saved = geom(2500.0, -300.0, 420.0, 180.0);

        let placement = resolve_placement(Some(&saved), Some("primary"), &[monitor], 0);

        assert_eq!(placement.physical_x, 1500);
        assert_eq!(placement.physical_y, 0);
        assert_eq!(placement.logical_width, 420.0);
        assert_eq!(placement.logical_height, 320.0);
    }

    #[test]
    fn mixed_dpi_monitor_uses_physical_origin_plus_logical_offset() {
        let monitors = vec![
            MonitorFrame {
                name: Some("left".into()),
                physical_x: 0,
                physical_y: 0,
                physical_width: 1920,
                physical_height: 1080,
                scale: 1.0,
            },
            MonitorFrame {
                name: Some("right".into()),
                physical_x: 1920,
                physical_y: 0,
                physical_width: 2560,
                physical_height: 1440,
                scale: 1.5,
            },
        ];
        let saved = geom(100.0, 40.0, 320.0, 72.0);

        let placement = resolve_placement(Some(&saved), Some("right"), &monitors, 0);

        assert_eq!(placement.physical_x, 2070);
        assert_eq!(placement.physical_y, 60);
        assert_eq!(placement.logical_width, 360.0);
        assert_eq!(placement.logical_height, 320.0);
    }

    #[test]
    fn tiny_monitor_does_not_panic_when_reminder_is_larger_than_screen() {
        let monitor = MonitorFrame {
            name: Some("tiny".into()),
            physical_x: 0,
            physical_y: 0,
            physical_width: 200,
            physical_height: 150,
            scale: 1.0,
        };

        let placement = resolve_reminder_placement((0, 0), (40, 40), &monitor);

        assert_eq!(placement.physical_x, 0);
        assert_eq!(placement.physical_y, 0);
    }
}
