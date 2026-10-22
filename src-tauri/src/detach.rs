use std::collections::{HashMap, HashSet};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex, OnceLock,
};
use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{Emitter, Manager, Runtime, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::notes::{self, NoteSummary};
use crate::paths::parse_zone;
use crate::system::WINDOW_LABEL;
use crate::{load_config, AppConfig, CapsuleSessionRef, PopoutSessionRef, WindowGeometry};

const POPOUT_CURSOR_ANCHOR_X: i32 = -40;
const POPOUT_CURSOR_ANCHOR_Y: i32 = -18;
const TAB_DRAG_PREVIEW_LABEL: &str = "tab-drag-preview";

#[cfg(windows)]
use windows::Win32::{
    Foundation::POINT,
    UI::{
        Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON},
        WindowsAndMessaging::{
            GetAncestor, GetCursorPos, SetWindowPos, WindowFromPoint, GA_ROOT, SWP_NOACTIVATE,
            SWP_NOZORDER,
        },
    },
};

/// 弹出窗口的初始化参数。窗口创建前存入 PENDING_INIT，
/// 前端就绪后通过 `take_popout_init` 主动拉取（避免事件推送的时序竞争）。
#[derive(Clone, Serialize)]
pub struct PopoutInit {
    pub zone: String,
    pub name: String,
    pub title: String,
    pub always_on_top: bool,
}

/// 胶囊窗口的初始化参数。
#[derive(Clone, Serialize)]
pub struct CapsuleInit {
    pub zone: String,
    pub name: String,
    pub title: String,
    /// 笔记颜色标签 ID（可为 null）
    pub note_color: Option<String>,
    /// 是否置顶
    pub always_on_top: bool,
    /// 当前吸附边（未吸附为 null）。
    pub snap_edge: Option<String>,
    /// 来源：主窗口（"main"）还是便签弹出窗口（"popout"）
    pub source: String,
}

#[derive(Clone, Serialize)]
pub struct TabDragPreviewPayload {
    pub title: String,
    pub pinned: bool,
    pub active: bool,
    #[serde(rename = "accentHex")]
    pub accent_hex: Option<String>,
    pub width: f64,
    pub height: f64,
    #[serde(rename = "grabOffsetX")]
    pub grab_offset_x: f64,
    #[serde(rename = "grabOffsetY")]
    pub grab_offset_y: f64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum UnifiedNoteWindowMode {
    Expanded,
    TransitioningToCapsule,
    Capsule,
    TransitioningToExpanded,
}

#[derive(Clone, Serialize)]
struct UnifiedNoteWindowModePayload {
    mode: String,
    #[serde(rename = "snapEdge")]
    snap_edge: Option<String>,
}

#[derive(Clone)]
struct UnifiedNoteWindowState {
    zone: String,
    name: String,
    title: String,
    always_on_top: bool,
    mode: UnifiedNoteWindowMode,
    expanded_geometry: WindowGeometry,
    capsule_geometry: WindowGeometry,
    snap_edge: Option<String>,
}

/// label → 弹出窗口初始化参数 的待取表。
fn pending_init() -> &'static Mutex<HashMap<String, PopoutInit>> {
    static PENDING: OnceLock<Mutex<HashMap<String, PopoutInit>>> = OnceLock::new();
    PENDING.get_or_init(|| Mutex::new(HashMap::new()))
}

/// label → 胶囊窗口初始化参数 的待取表。
fn pending_capsule_init() -> &'static Mutex<HashMap<String, CapsuleInit>> {
    static PENDING: OnceLock<Mutex<HashMap<String, CapsuleInit>>> = OnceLock::new();
    PENDING.get_or_init(|| Mutex::new(HashMap::new()))
}

fn tab_drag_preview_state() -> &'static Mutex<Option<TabDragPreviewPayload>> {
    static STATE: OnceLock<Mutex<Option<TabDragPreviewPayload>>> = OnceLock::new();
    STATE.get_or_init(|| Mutex::new(None))
}

fn tab_drag_preview_watcher() -> &'static Mutex<Option<Arc<AtomicBool>>> {
    static WATCHER: OnceLock<Mutex<Option<Arc<AtomicBool>>>> = OnceLock::new();
    WATCHER.get_or_init(|| Mutex::new(None))
}

fn unified_note_windows() -> &'static Mutex<HashMap<String, UnifiedNoteWindowState>> {
    static WINDOWS: OnceLock<Mutex<HashMap<String, UnifiedNoteWindowState>>> = OnceLock::new();
    WINDOWS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn popout_label_aliases() -> &'static Mutex<HashMap<(String, String), String>> {
    static ALIASES: OnceLock<Mutex<HashMap<(String, String), String>>> = OnceLock::new();
    ALIASES.get_or_init(|| Mutex::new(HashMap::new()))
}

/// 胶囊被转换为 Popout 时，销毁窗口不应被解释为“关闭胶囊并归还 Tab”。
fn suppressed_capsule_close_events() -> &'static Mutex<HashSet<String>> {
    static SUPPRESSED: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    SUPPRESSED.get_or_init(|| Mutex::new(HashSet::new()))
}

/// Popout 被转换为胶囊时，销毁窗口不应被解释为“关闭 Popout 并归还 Tab”。
fn suppressed_popout_close_events() -> &'static Mutex<HashSet<String>> {
    static SUPPRESSED: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    SUPPRESSED.get_or_init(|| Mutex::new(HashSet::new()))
}

fn suppress_popout_close_event(label: &str) {
    suppressed_popout_close_events()
        .lock()
        .unwrap()
        .insert(label.to_string());
}

fn unsuppress_popout_close_event(label: &str) {
    suppressed_popout_close_events()
        .lock()
        .unwrap()
        .remove(label);
}

fn capsule_snap_watchers() -> &'static Mutex<HashMap<String, Arc<AtomicBool>>> {
    static WATCHERS: OnceLock<Mutex<HashMap<String, Arc<AtomicBool>>>> = OnceLock::new();
    WATCHERS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// 生成弹出窗口的唯一 label，基于 zone + name 派生，确保同一笔记只有一个窗口。
fn popout_label(zone: &str, name: &str) -> String {
    format!(
        "popout-{}-{}",
        zone.replace(':', "_"),
        name.replace('.', "_").replace(' ', "_")
    )
}

fn unified_window_label_for_note(zone: &str, name: &str) -> String {
    if let Some(label) = popout_label_aliases()
        .lock()
        .unwrap()
        .get(&(zone.to_string(), name.to_string()))
        .cloned()
    {
        return label;
    }
    unified_note_windows()
        .lock()
        .unwrap()
        .iter()
        .find(|(_, state)| state.zone == zone && state.name == name)
        .map(|(label, _)| label.clone())
        .unwrap_or_else(|| popout_label(zone, name))
}

fn register_popout_label_alias(zone: &str, name: &str, label: &str) {
    popout_label_aliases()
        .lock()
        .unwrap()
        .insert((zone.to_string(), name.to_string()), label.to_string());
}

fn remove_popout_label_alias(zone: &str, name: &str) {
    popout_label_aliases()
        .lock()
        .unwrap()
        .remove(&(zone.to_string(), name.to_string()));
}

fn rename_unified_window_note(zone: &str, old_name: &str, new_name: &str, title: &str) {
    let mut windows = unified_note_windows().lock().unwrap();
    for state in windows.values_mut() {
        if state.zone == zone && state.name == old_name {
            state.name = new_name.to_string();
            state.title = title.to_string();
        }
    }
}

/// 生成胶囊窗口的唯一 label。
fn capsule_label(zone: &str, name: &str) -> String {
    format!(
        "capsule-{}-{}",
        zone.replace(':', "_"),
        name.replace('.', "_").replace(' ', "_")
    )
}

/// 胶囊窗口固定宽度（逻辑像素）。给标题、完成、置顶和关闭按钮留出空间。
const CAPSULE_WIDTH: f64 = 280.0;
/// 胶囊窗口固定高度（与 PopoutView 顶栏一致）。
const CAPSULE_HEIGHT: f64 = 40.0;
/// 胶囊与触发窗口之间的垂直间距（逻辑像素）。
const CAPSULE_GAP: f64 = 5.0;
const DEFAULT_POPOUT_WIDTH: f64 = 400.0;
const DEFAULT_POPOUT_HEIGHT: f64 = 300.0;
/// Popout 顶栏标题文字起点与胶囊标题文字起点的横向差值。
const POPOUT_TO_CAPSULE_TITLE_X_DELTA: f64 = 22.0;
/// 左右贴边时保留的可见宽度：约 6 个中文字，避免只露出一条细边。
const CAPSULE_SIDE_HANDLE_WIDTH: f64 = 108.0;
/// 顶部贴边保留一条横向唤出带，宽度本身仍是完整胶囊宽度。
const CAPSULE_TOP_HANDLE_HEIGHT: f64 = 8.0;
const CAPSULE_HOVER_HIDE_DELAY_MS: u64 = 120;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CapsuleSnapEdge {
    Left,
    Right,
    Top,
}

impl CapsuleSnapEdge {
    fn as_str(self) -> &'static str {
        match self {
            Self::Left => "left",
            Self::Right => "right",
            Self::Top => "top",
        }
    }

    fn from_str(value: &str) -> Option<Self> {
        match value {
            "left" => Some(Self::Left),
            "right" => Some(Self::Right),
            "top" => Some(Self::Top),
            _ => None,
        }
    }
}

#[derive(Debug, Clone)]
struct CapsuleSnapPlacement {
    edge: CapsuleSnapEdge,
    visible: WindowGeometry,
    hidden: WindowGeometry,
}

fn capsule_key(zone: &str, name: &str) -> (String, String) {
    (zone.to_string(), name.to_string())
}

fn upsert_capsule_session(config: &mut AppConfig, session: CapsuleSessionRef) {
    let key = capsule_key(&session.zone, &session.name);
    let sessions = config.capsule_sessions.get_or_insert_with(Vec::new);
    if let Some(existing) = sessions
        .iter_mut()
        .find(|item| capsule_key(&item.zone, &item.name) == key)
    {
        *existing = session;
    } else {
        sessions.push(session);
    }
}

fn upsert_popout_session(config: &mut AppConfig, session: PopoutSessionRef) {
    let key = capsule_key(&session.zone, &session.name);
    let sessions = config.popout_sessions.get_or_insert_with(Vec::new);
    if let Some(existing) = sessions
        .iter_mut()
        .find(|item| capsule_key(&item.zone, &item.name) == key)
    {
        *existing = session;
    } else {
        sessions.push(session);
    }
}

fn remove_popout_session(config: &mut AppConfig, zone: &str, name: &str) {
    let Some(sessions) = config.popout_sessions.as_mut() else {
        return;
    };
    sessions.retain(|item| !(item.zone == zone && item.name == name));
    if sessions.is_empty() {
        config.popout_sessions = None;
    }
}

fn remove_capsule_session(config: &mut AppConfig, zone: &str, name: &str) {
    let Some(sessions) = config.capsule_sessions.as_mut() else {
        return;
    };
    sessions.retain(|item| !(item.zone == zone && item.name == name));
    if sessions.is_empty() {
        config.capsule_sessions = None;
    }
}

fn set_capsule_session_always_on_top(
    config: &mut AppConfig,
    fallback: CapsuleSessionRef,
    always_on_top: bool,
) {
    let mut session = config
        .capsule_sessions
        .as_ref()
        .and_then(|sessions| {
            sessions
                .iter()
                .find(|item| item.zone == fallback.zone && item.name == fallback.name)
                .cloned()
        })
        .unwrap_or(fallback);
    session.always_on_top = always_on_top;
    upsert_capsule_session(config, session);
}

fn capsule_session_geometry(window_x: f64, window_y: f64) -> WindowGeometry {
    WindowGeometry {
        x: window_x,
        y: window_y,
        width: CAPSULE_WIDTH,
        height: CAPSULE_HEIGHT,
    }
}

fn resolve_capsule_snap(
    current: &WindowGeometry,
    monitor: &WindowGeometry,
    side_handle_width: f64,
    top_handle_height: f64,
) -> Option<CapsuleSnapPlacement> {
    let right_overflow = (current.x + current.width - (monitor.x + monitor.width)).max(0.0);
    let candidates = [
        (CapsuleSnapEdge::Left, (monitor.x - current.x).max(0.0)),
        (CapsuleSnapEdge::Right, right_overflow),
        (CapsuleSnapEdge::Top, (monitor.y - current.y).max(0.0)),
    ];
    let (edge, overflow) = candidates
        .into_iter()
        .max_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal))?;
    if overflow <= 0.0 {
        return None;
    }

    capsule_snap_for_edge(edge, current, monitor, side_handle_width, top_handle_height)
}

fn capsule_snap_for_edge(
    edge: CapsuleSnapEdge,
    current: &WindowGeometry,
    monitor: &WindowGeometry,
    side_handle_width: f64,
    top_handle_height: f64,
) -> Option<CapsuleSnapPlacement> {
    let right_x = monitor.x + monitor.width - current.width;
    let max_x = monitor.x + monitor.width - current.width;
    let max_y = monitor.y + monitor.height - current.height;
    let clamped_x = current.x.clamp(monitor.x, max_x.max(monitor.x));
    let clamped_y = current.y.clamp(monitor.y, max_y.max(monitor.y));

    let visible = match edge {
        CapsuleSnapEdge::Left => WindowGeometry {
            x: monitor.x,
            y: clamped_y,
            width: current.width,
            height: current.height,
        },
        CapsuleSnapEdge::Right => WindowGeometry {
            x: right_x,
            y: clamped_y,
            width: current.width,
            height: current.height,
        },
        CapsuleSnapEdge::Top => WindowGeometry {
            x: clamped_x,
            y: monitor.y,
            width: current.width,
            height: current.height,
        },
    };

    let hidden = match edge {
        CapsuleSnapEdge::Left => WindowGeometry {
            x: monitor.x - current.width + side_handle_width,
            y: visible.y,
            width: current.width,
            height: current.height,
        },
        CapsuleSnapEdge::Right => WindowGeometry {
            x: monitor.x + monitor.width - side_handle_width,
            y: visible.y,
            width: current.width,
            height: current.height,
        },
        CapsuleSnapEdge::Top => WindowGeometry {
            x: visible.x,
            y: monitor.y - current.height + top_handle_height,
            width: current.width,
            height: current.height,
        },
    };

    Some(CapsuleSnapPlacement {
        edge,
        visible,
        hidden,
    })
}

fn stop_capsule_snap_watcher(label: &str) {
    if let Some(flag) = capsule_snap_watchers().lock().unwrap().remove(label) {
        flag.store(false, Ordering::Relaxed);
    }
}

fn monitor_geometry_for_window<R: Runtime>(window: &WebviewWindow<R>) -> Option<WindowGeometry> {
    let monitor = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten())?;
    let scale = window.scale_factor().unwrap_or(1.0);
    let pos = monitor.position();
    let size = monitor.size();
    Some(WindowGeometry {
        x: pos.x as f64 / scale,
        y: pos.y as f64 / scale,
        width: size.width as f64 / scale,
        height: size.height as f64 / scale,
    })
}

fn window_geometry<R: Runtime>(window: &WebviewWindow<R>) -> Result<WindowGeometry, String> {
    let pos = window.outer_position().map_err(|e| e.to_string())?;
    let size = window.inner_size().map_err(|e| e.to_string())?;
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    Ok(WindowGeometry {
        x: pos.x as f64 / scale,
        y: pos.y as f64 / scale,
        width: size.width as f64 / scale,
        height: size.height as f64 / scale,
    })
}

fn set_window_position<R: Runtime>(window: &WebviewWindow<R>, geom: &WindowGeometry) {
    let _ = window.set_position(tauri::LogicalPosition::new(geom.x, geom.y));
}

fn animate_window_to<R: Runtime>(window: &WebviewWindow<R>, target: &WindowGeometry) {
    animate_window_to_while(window, target, || true);
}

#[cfg(windows)]
fn set_window_bounds<R: Runtime>(
    window: &WebviewWindow<R>,
    geom: &WindowGeometry,
) -> Result<(), String> {
    let scale = window.scale_factor().map_err(|err| err.to_string())?;
    let hwnd = window.hwnd().map_err(|err| err.to_string())?;
    unsafe {
        SetWindowPos(
            hwnd,
            None,
            (geom.x * scale).round() as i32,
            (geom.y * scale).round() as i32,
            (geom.width * scale).round() as i32,
            (geom.height * scale).round() as i32,
            SWP_NOACTIVATE | SWP_NOZORDER,
        )
        .map_err(|err| err.to_string())?;
    }
    Ok(())
}

#[cfg(not(windows))]
fn set_window_bounds<R: Runtime>(
    window: &WebviewWindow<R>,
    geom: &WindowGeometry,
) -> Result<(), String> {
    window
        .set_size(tauri::LogicalSize::new(geom.width, geom.height))
        .map_err(|err| err.to_string())?;
    window
        .set_position(tauri::LogicalPosition::new(geom.x, geom.y))
        .map_err(|err| err.to_string())
}

fn animate_window_to_while<R: Runtime>(
    window: &WebviewWindow<R>,
    target: &WindowGeometry,
    keep_running: impl Fn() -> bool,
) {
    let Ok(start) = window_geometry(window) else {
        set_window_position(window, target);
        return;
    };
    const STEPS: usize = 10;
    for step in 1..=STEPS {
        if !keep_running() {
            return;
        }
        let t = step as f64 / STEPS as f64;
        let x = start.x + (target.x - start.x) * t;
        let y = start.y + (target.y - start.y) * t;
        let _ = window.set_position(tauri::LogicalPosition::new(x, y));
        thread::sleep(Duration::from_millis(16));
    }
}

#[cfg(windows)]
fn cursor_logical(scale: f64) -> Option<(f64, f64)> {
    let mut point = POINT::default();
    unsafe {
        if GetCursorPos(&mut point).is_err() {
            return None;
        }
    }
    Some((point.x as f64 / scale, point.y as f64 / scale))
}

#[cfg(not(windows))]
fn cursor_logical(_scale: f64) -> Option<(f64, f64)> {
    None
}

#[cfg(windows)]
fn cursor_physical() -> Option<(i32, i32)> {
    let mut point = POINT::default();
    unsafe {
        if GetCursorPos(&mut point).is_err() {
            return None;
        }
    }
    Some((point.x, point.y))
}

#[cfg(not(windows))]
fn cursor_physical() -> Option<(i32, i32)> {
    None
}

#[cfg(windows)]
fn cursor_over_window<R: Runtime>(window: &WebviewWindow<R>) -> Option<bool> {
    let mut point = POINT::default();
    unsafe {
        if GetCursorPos(&mut point).is_err() {
            return None;
        }
        let hit = WindowFromPoint(point);
        if hit.0.is_null() {
            return Some(false);
        }
        let root = GetAncestor(hit, GA_ROOT);
        let own = window.hwnd().ok()?;
        Some(root == own || hit == own)
    }
}

#[cfg(not(windows))]
fn cursor_over_window<R: Runtime>(_window: &WebviewWindow<R>) -> Option<bool> {
    None
}

#[cfg(windows)]
fn left_mouse_button_down() -> bool {
    unsafe { GetAsyncKeyState(VK_LBUTTON.0 as i32) < 0 }
}

#[cfg(not(windows))]
fn left_mouse_button_down() -> bool {
    false
}

fn point_in_rect(x: f64, y: f64, rect: &WindowGeometry) -> bool {
    x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height
}

fn point_in_exposed_handle(
    x: f64,
    y: f64,
    snap: &CapsuleSnapPlacement,
    side_handle_width: f64,
    top_handle_height: f64,
) -> bool {
    match snap.edge {
        CapsuleSnapEdge::Left => {
            x >= snap.visible.x
                && x <= snap.visible.x + side_handle_width
                && y >= snap.hidden.y
                && y <= snap.hidden.y + snap.hidden.height
        }
        CapsuleSnapEdge::Right => {
            x >= snap.hidden.x
                && x <= snap.hidden.x + side_handle_width
                && y >= snap.hidden.y
                && y <= snap.hidden.y + snap.hidden.height
        }
        CapsuleSnapEdge::Top => {
            x >= snap.hidden.x
                && x <= snap.hidden.x + snap.hidden.width
                && y >= snap.visible.y
                && y <= snap.visible.y + top_handle_height
        }
    }
}

fn start_capsule_snap_watcher(
    app: tauri::AppHandle,
    label: String,
    snap: CapsuleSnapPlacement,
    initially_visible: bool,
    wait_for_handle_leave_after_hide: bool,
) {
    stop_capsule_snap_watcher(&label);
    let running = Arc::new(AtomicBool::new(true));
    capsule_snap_watchers()
        .lock()
        .unwrap()
        .insert(label.clone(), running.clone());

    thread::spawn(move || {
        let mut visible = initially_visible;
        let mut last_inside = Instant::now();
        let mut wait_for_handle_leave = wait_for_handle_leave_after_hide;
        while running.load(Ordering::Relaxed) {
            let Some(window) = app.get_webview_window(&label) else {
                break;
            };
            let scale = window.scale_factor().unwrap_or(1.0);
            let Some((cx, cy)) = cursor_logical(scale) else {
                thread::sleep(Duration::from_millis(120));
                continue;
            };

            if visible {
                let hover_rect = window_geometry(&window).unwrap_or_else(|_| snap.visible.clone());
                let cursor_inside = cursor_over_window(&window)
                    .unwrap_or_else(|| point_in_rect(cx, cy, &hover_rect));
                if cursor_inside {
                    last_inside = Instant::now();
                } else if last_inside.elapsed()
                    >= Duration::from_millis(CAPSULE_HOVER_HIDE_DELAY_MS)
                {
                    animate_window_to_while(&window, &snap.hidden, || {
                        running.load(Ordering::Relaxed)
                    });
                    visible = false;
                    wait_for_handle_leave = true;
                }
            } else {
                let cursor_in_handle = point_in_exposed_handle(
                    cx,
                    cy,
                    &snap,
                    CAPSULE_SIDE_HANDLE_WIDTH,
                    CAPSULE_TOP_HANDLE_HEIGHT,
                );
                if wait_for_handle_leave {
                    if !cursor_in_handle {
                        wait_for_handle_leave = false;
                    }
                } else if cursor_in_handle {
                    animate_window_to_while(&window, &snap.visible, || {
                        running.load(Ordering::Relaxed)
                    });
                    visible = true;
                    last_inside = Instant::now();
                }
            }

            thread::sleep(Duration::from_millis(120));
        }
    });
}

fn session_for_capsule(
    zone: &str,
    name: &str,
    title: &str,
    note_color: Option<String>,
    always_on_top: bool,
    geometry: WindowGeometry,
    snap_edge: Option<String>,
) -> CapsuleSessionRef {
    CapsuleSessionRef {
        zone: zone.to_string(),
        name: name.to_string(),
        title: title.to_string(),
        note_color,
        always_on_top,
        geometry,
        snap_edge,
    }
}

fn session_for_popout(
    zone: &str,
    name: &str,
    title: &str,
    always_on_top: bool,
    geometry: WindowGeometry,
) -> PopoutSessionRef {
    PopoutSessionRef {
        zone: zone.to_string(),
        name: name.to_string(),
        title: title.to_string(),
        always_on_top,
        geometry,
    }
}

fn unified_mode_name(mode: UnifiedNoteWindowMode) -> &'static str {
    match mode {
        UnifiedNoteWindowMode::Expanded => "expanded",
        UnifiedNoteWindowMode::TransitioningToCapsule => "transitioning-to-capsule",
        UnifiedNoteWindowMode::Capsule => "capsule",
        UnifiedNoteWindowMode::TransitioningToExpanded => "transitioning-to-expanded",
    }
}

fn unified_payload(state: &UnifiedNoteWindowState) -> UnifiedNoteWindowModePayload {
    UnifiedNoteWindowModePayload {
        mode: unified_mode_name(state.mode).to_string(),
        snap_edge: state.snap_edge.clone(),
    }
}

fn is_unified_expanded_mode(label: &str) -> bool {
    unified_note_windows()
        .lock()
        .unwrap()
        .get(label)
        .map(|state| state.mode == UnifiedNoteWindowMode::Expanded)
        .unwrap_or(true)
}

fn note_popout_session_geometry(zone: &str, name: &str) -> Option<WindowGeometry> {
    load_config().ok().and_then(|config| {
        config.popout_sessions.and_then(|sessions| {
            sessions
                .into_iter()
                .find(|item| item.zone == zone && item.name == name)
                .map(|item| item.geometry)
        })
    })
}

fn freeze_expanded_geometry<R: Runtime>(
    label: &str,
    zone: &str,
    name: &str,
    window: &WebviewWindow<R>,
) -> WindowGeometry {
    if let Some(state) = unified_note_windows().lock().unwrap().get(label) {
        if state.mode != UnifiedNoteWindowMode::Expanded {
            return state.expanded_geometry.clone();
        }
    }
    window_geometry(window)
        .ok()
        .or_else(|| note_popout_session_geometry(zone, name))
        .unwrap_or(WindowGeometry {
            x: 0.0,
            y: 0.0,
            width: DEFAULT_POPOUT_WIDTH,
            height: DEFAULT_POPOUT_HEIGHT,
        })
}

fn persist_popout_session(session: PopoutSessionRef) -> Result<(), String> {
    crate::update_config(|config| {
        upsert_popout_session(config, session);
        Ok(())
    })
    .map(|_| ())
}

fn remove_persisted_popout_session(zone: &str, name: &str) -> Result<(), String> {
    crate::update_config(|config| {
        remove_popout_session(config, zone, name);
        Ok(())
    })
    .map(|_| ())
}

fn persist_capsule_session(session: CapsuleSessionRef) -> Result<(), String> {
    crate::update_config(|config| {
        upsert_capsule_session(config, session);
        Ok(())
    })
    .map(|_| ())
}

fn remove_persisted_capsule_session(zone: &str, name: &str) {
    let _ = crate::update_config(|config| {
        remove_capsule_session(config, zone, name);
        Ok(())
    });
}

fn tab_drag_preview_position(window: &WebviewWindow) -> Option<tauri::PhysicalPosition<i32>> {
    let payload = tab_drag_preview_state().lock().unwrap().clone()?;
    let (cursor_x, cursor_y) = cursor_physical()?;
    let scale = window.scale_factor().unwrap_or(1.0);
    Some(tauri::PhysicalPosition::new(
        cursor_x - (payload.grab_offset_x * scale).round() as i32,
        cursor_y - (payload.grab_offset_y * scale).round() as i32,
    ))
}

fn stop_tab_drag_preview_watcher() {
    if let Some(flag) = tab_drag_preview_watcher().lock().unwrap().take() {
        flag.store(false, Ordering::Relaxed);
    }
}

fn start_tab_drag_preview_watcher(window: WebviewWindow) {
    stop_tab_drag_preview_watcher();
    let running = Arc::new(AtomicBool::new(true));
    *tab_drag_preview_watcher().lock().unwrap() = Some(running.clone());
    thread::spawn(move || {
        while running.load(Ordering::Relaxed) && left_mouse_button_down() {
            if let Some(position) = tab_drag_preview_position(&window) {
                let _ = window.set_position(position);
            }
            thread::sleep(Duration::from_millis(16));
        }
        let _ = window.hide();
        running.store(false, Ordering::Relaxed);
    });
}

fn ensure_tab_drag_preview_window(
    app: &tauri::AppHandle,
    width: f64,
    height: f64,
) -> Result<WebviewWindow, String> {
    if let Some(window) = app.get_webview_window(TAB_DRAG_PREVIEW_LABEL) {
        let _ = window.set_size(tauri::LogicalSize::new(width, height));
        return Ok(window);
    }
    let window =
        WebviewWindowBuilder::new(app, TAB_DRAG_PREVIEW_LABEL, WebviewUrl::App("/".into()))
            .title("Tab Drag Preview")
            .inner_size(width, height)
            .decorations(false)
            .transparent(true)
            .always_on_top(true)
            .visible(false)
            .resizable(false)
            .skip_taskbar(true)
            .build()
            .map_err(|err| err.to_string())?;
    let _ = window.set_ignore_cursor_events(true);
    Ok(window)
}

#[tauri::command]
pub async fn show_tab_drag_preview(
    app: tauri::AppHandle,
    title: String,
    pinned: bool,
    active: bool,
    accent_hex: Option<String>,
    width: f64,
    height: f64,
    grab_offset_x: f64,
    grab_offset_y: f64,
) -> Result<(), String> {
    let payload = TabDragPreviewPayload {
        title,
        pinned,
        active,
        accent_hex,
        width,
        height,
        grab_offset_x,
        grab_offset_y,
    };
    *tab_drag_preview_state().lock().unwrap() = Some(payload.clone());
    let window = ensure_tab_drag_preview_window(&app, width, height)?;
    let _ = window.emit("mknote:tab-drag-preview", payload);
    if let Some(position) = tab_drag_preview_position(&window) {
        let _ = window.set_position(position);
    }
    let _ = window.show();
    start_tab_drag_preview_watcher(window);
    Ok(())
}

#[tauri::command]
pub async fn hide_tab_drag_preview(app: tauri::AppHandle) -> Result<(), String> {
    stop_tab_drag_preview_watcher();
    *tab_drag_preview_state().lock().unwrap() = None;
    if let Some(window) = app.get_webview_window(TAB_DRAG_PREVIEW_LABEL) {
        let _ = window.hide();
    }
    Ok(())
}

#[tauri::command]
pub fn take_tab_drag_preview_state() -> Option<TabDragPreviewPayload> {
    tab_drag_preview_state().lock().unwrap().clone()
}

fn cursor_anchored_popout_position<R: Runtime>(
    window: &WebviewWindow<R>,
    logical_width: f64,
    logical_height: f64,
) -> Option<tauri::PhysicalPosition<i32>> {
    let (cursor_x, cursor_y) = cursor_physical()?;
    let monitors = window.available_monitors().unwrap_or_default();
    let monitor = monitors
        .iter()
        .find(|monitor| {
            let pos = monitor.position();
            let size = monitor.size();
            cursor_x >= pos.x
                && cursor_x <= pos.x + size.width as i32
                && cursor_y >= pos.y
                && cursor_y <= pos.y + size.height as i32
        })
        .or_else(|| monitors.first());

    let Some(monitor) = monitor else {
        return Some(tauri::PhysicalPosition::new(
            cursor_x + POPOUT_CURSOR_ANCHOR_X,
            cursor_y + POPOUT_CURSOR_ANCHOR_Y,
        ));
    };

    let scale = monitor.scale_factor();
    let popout_width = (logical_width * scale).round() as i32;
    let popout_height = (logical_height * scale).round() as i32;
    let pos = monitor.position();
    let size = monitor.size();
    let left = pos.x;
    let top = pos.y;
    let right = pos.x + size.width as i32;
    let bottom = pos.y + size.height as i32;
    let max_x = (right - popout_width).max(left);
    let max_y = (bottom - popout_height).max(top);
    let x = (cursor_x + POPOUT_CURSOR_ANCHOR_X).clamp(left, max_x);
    let y = (cursor_y + POPOUT_CURSOR_ANCHOR_Y).clamp(top, max_y);
    Some(tauri::PhysicalPosition::new(x, y))
}

/// 打开便签弹出窗口。
///
/// 不通过 URL 传参（Tauri 2 dev 模式下 URL 附加内容会被丢弃），
/// 改为窗口创建后通过 Tauri 事件推送 zone/name/title。
/// x/y 为新窗口左上角的屏幕坐标（可选，用于拖拽弹出时定位到鼠标位置）。
#[tauri::command]
pub async fn open_note_popout(
    app: tauri::AppHandle,
    zone: String,
    name: String,
    title: String,
    width: f64,
    height: f64,
    x: Option<f64>,
    y: Option<f64>,
    use_cursor_position: Option<bool>,
) -> Result<(), String> {
    let label = unified_window_label_for_note(&zone, &name);

    // 已存在：聚焦并告知前端窗口已打开
    if let Some(w) = app.get_webview_window(&label) {
        let _ = w.show();
        let _ = w.set_focus();
        return Err("already_open".into());
    }

    // 合法化尺寸：弹出窗口最小 400×300
    let w = width.max(400.0);
    let h = height.max(300.0);
    let existing_session = load_config().ok().and_then(|config| {
        config.popout_sessions.and_then(|sessions| {
            sessions
                .into_iter()
                .find(|item| item.zone == zone && item.name == name)
        })
    });
    let always_on_top = existing_session
        .as_ref()
        .map(|session| session.always_on_top)
        .unwrap_or(false);

    // 参数在窗口创建前存入待取表，前端就绪后通过 take_popout_init 主动拉取。
    // 这样彻底避免了 emit 与前端 listen 注册之间的时序竞争。
    pending_init().lock().unwrap().insert(
        label.clone(),
        PopoutInit {
            zone: zone.clone(),
            name: name.clone(),
            title: title.clone(),
            always_on_top,
        },
    );

    // 创建弹出窗口，加载普通入口页面（不带参数）
    let url = WebviewUrl::App("/".into());
    let mut builder = WebviewWindowBuilder::new(&app, &label, url)
        .title(&title)
        .inner_size(w, h)
        .min_inner_size(400.0, 300.0)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(always_on_top)
        .visible(false) // 内容就绪后由前端 show()，避免白屏闪烁
        .resizable(true)
        .skip_taskbar(true);

    // 兼容非拖拽路径：若调用方显式提供逻辑坐标，仍可设置窗口左上角。
    if use_cursor_position != Some(true) {
        if let (Some(px), Some(py)) = (x, y) {
            builder = builder.position(px, py);
        }
    }

    let window = builder.build().map_err(|e| {
        // 创建失败时清理待取表，避免泄漏
        pending_init().lock().unwrap().remove(&label);
        e.to_string()
    })?;

    if use_cursor_position == Some(true) {
        if let Some(position) = cursor_anchored_popout_position(&window, w, h) {
            let _ = window.set_position(position);
        }
    }

    let geometry = window_geometry(&window).unwrap_or(WindowGeometry {
        x: x.unwrap_or(0.0),
        y: y.unwrap_or(0.0),
        width: w,
        height: h,
    });
    persist_popout_session(session_for_popout(
        &zone,
        &name,
        &title,
        always_on_top,
        geometry,
    ))?;

    // 监听弹出窗口关闭事件，通知主窗口把 Tab 归还
    let app_handle = app.clone();
    let zone_clone = zone.clone();
    let name_clone = name.clone();
    let label_clone = label.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::Destroyed = event {
            if suppressed_popout_close_events()
                .lock()
                .unwrap()
                .remove(&label_clone)
            {
                return;
            }
            if let Some(main) = app_handle.get_webview_window(WINDOW_LABEL) {
                let _ = main.emit(
                    "mknote:popout-closed",
                    serde_json::json!({ "zone": zone_clone, "name": name_clone }),
                );
            }
        }
    });

    Ok(())
}

/// 前端弹出窗口就绪后调用，按自身 label 取走初始化参数。
/// 返回 None 表示不是弹出窗口，或参数已被取走。
#[tauri::command]
pub fn take_popout_init(label: String) -> Option<PopoutInit> {
    pending_init().lock().unwrap().remove(&label)
}

/// 关闭指定笔记的弹出窗口（由弹出窗口自身的关闭按钮调用）。
#[tauri::command]
pub async fn close_note_popout(
    app: tauri::AppHandle,
    zone: String,
    name: String,
) -> Result<(), String> {
    let label = unified_window_label_for_note(&zone, &name);
    unified_note_windows().lock().unwrap().remove(&label);
    if let Some(w) = app.get_webview_window(&label) {
        suppress_popout_close_event(&label);
        if let Some(main) = app.get_webview_window(WINDOW_LABEL) {
            let _ = main.emit(
                "mknote:popout-closed",
                serde_json::json!({ "zone": zone, "name": name }),
            );
        }
        // 用 destroy 而非 close：destroy 不触发可拦截的 CloseRequested 事件，
        // 直接强制销毁窗口，从根上避免前端 onCloseRequested 造成的关闭循环。
        if let Err(error) = w.destroy() {
            unsuppress_popout_close_event(&label);
            return Err(error.to_string());
        }
    }
    remove_popout_label_alias(&zone, &name);
    remove_persisted_popout_session(&zone, &name)?;
    Ok(())
}

/// 将弹出窗口中的笔记移入回收站并关闭窗口，不触发主窗口 Tab 归还。
#[tauri::command]
pub async fn delete_note_popout(
    app: tauri::AppHandle,
    zone: String,
    name: String,
) -> Result<(), String> {
    let source_zone = parse_zone(&zone)?;
    notes::delete_note(&app, source_zone, &name)?;

    let label = unified_window_label_for_note(&zone, &name);
    unified_note_windows().lock().unwrap().remove(&label);
    remove_persisted_popout_session(&zone, &name)?;

    if let Some(window) = app.get_webview_window(&label) {
        suppressed_popout_close_events()
            .lock()
            .unwrap()
            .insert(label.clone());
        if let Err(err) = window.destroy() {
            suppressed_popout_close_events()
                .lock()
                .unwrap()
                .remove(&label);
            return Err(err.to_string());
        }
    }
    remove_popout_label_alias(&zone, &name);

    if let Some(main) = app.get_webview_window(WINDOW_LABEL) {
        let _ = main.emit(
            "mknote:popout-note-deleted",
            serde_json::json!({ "zone": zone, "name": name }),
        );
    }
    Ok(())
}

#[tauri::command]
pub async fn complete_capsule_note(
    app: tauri::AppHandle,
    zone: String,
    name: String,
    label: Option<String>,
) -> Result<NoteSummary, String> {
    let source_zone = parse_zone(&zone)?;
    let updated = notes::archive_note(&app, source_zone, &name)?;
    let window_label = label.unwrap_or_else(|| popout_label(&zone, &name));

    crate::update_config(|config| {
        remove_popout_session(config, &zone, &name);
        remove_capsule_session(config, &zone, &name);
        Ok(())
    })?;

    unified_note_windows().lock().unwrap().remove(&window_label);
    stop_capsule_snap_watcher(&window_label);

    if let Some(window) = app.get_webview_window(&window_label) {
        suppressed_popout_close_events()
            .lock()
            .unwrap()
            .insert(window_label.clone());
        suppressed_capsule_close_events()
            .lock()
            .unwrap()
            .insert(window_label.clone());
        if let Err(err) = window.destroy() {
            suppressed_popout_close_events()
                .lock()
                .unwrap()
                .remove(&window_label);
            suppressed_capsule_close_events()
                .lock()
                .unwrap()
                .remove(&window_label);
            return Err(err.to_string());
        }
    }

    if let Some(main) = app.get_webview_window(WINDOW_LABEL) {
        let _ = main.emit(
            "mknote:note-completed-archived",
            serde_json::json!({
                "fromZone": zone,
                "fromName": name,
                "note": updated,
            }),
        );
    }

    Ok(updated)
}

/// 打开胶囊窗口。
///
/// 胶囊是固定尺寸（280×40）的无边框圆形小窗，显示在触发窗口上方 5px、左对齐。
/// anchor_x / anchor_y 为触发窗口左上角的屏幕逻辑坐标（由前端传入）。
async fn create_capsule_window(
    app: tauri::AppHandle,
    zone: &str,
    name: &str,
    title: &str,
    note_color: Option<String>,
    always_on_top: bool,
    geometry: WindowGeometry,
    source: String,
    persist: bool,
    snap_edge: Option<String>,
) -> Result<(), String> {
    let label = capsule_label(zone, name);

    // 已存在则聚焦
    if let Some(w) = app.get_webview_window(&label) {
        let _ = w.show();
        let _ = w.set_focus();
        return Ok(());
    }

    pending_capsule_init().lock().unwrap().insert(
        label.clone(),
        CapsuleInit {
            zone: zone.to_string(),
            name: name.to_string(),
            title: title.to_string(),
            note_color: note_color.clone(),
            always_on_top,
            snap_edge: snap_edge.clone(),
            source,
        },
    );

    let url = WebviewUrl::App("/".into());
    let window = WebviewWindowBuilder::new(&app, &label, url)
        .title(title)
        .inner_size(CAPSULE_WIDTH, CAPSULE_HEIGHT)
        .min_inner_size(CAPSULE_WIDTH, CAPSULE_HEIGHT)
        .max_inner_size(CAPSULE_WIDTH, CAPSULE_HEIGHT)
        .position(geometry.x, geometry.y)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(always_on_top)
        .resizable(false)
        .skip_taskbar(true)
        .visible(false)
        .build()
        .map_err(|e| {
            pending_capsule_init().lock().unwrap().remove(&label);
            e.to_string()
        })?;

    if persist {
        let session = session_for_capsule(
            zone,
            name,
            title,
            note_color,
            always_on_top,
            geometry.clone(),
            snap_edge.clone(),
        );
        persist_capsule_session(session)?;
    }

    if let Some(edge) = snap_edge.as_deref().and_then(CapsuleSnapEdge::from_str) {
        if let Some(monitor) = monitor_geometry_for_window(&window) {
            let visible = match edge {
                CapsuleSnapEdge::Left => WindowGeometry {
                    x: monitor.x,
                    ..geometry.clone()
                },
                CapsuleSnapEdge::Right => WindowGeometry {
                    x: monitor.x + monitor.width - geometry.width,
                    ..geometry.clone()
                },
                CapsuleSnapEdge::Top => WindowGeometry {
                    y: monitor.y,
                    ..geometry.clone()
                },
            };
            if let Some(snap) = capsule_snap_for_edge(
                edge,
                &visible,
                &monitor,
                CAPSULE_SIDE_HANDLE_WIDTH,
                CAPSULE_TOP_HANDLE_HEIGHT,
            ) {
                let _ = window.emit("mknote:capsule-snap-changed", snap.edge.as_str());
                set_window_position(&window, &snap.hidden);
                start_capsule_snap_watcher(app.clone(), label.clone(), snap, false, true);
            }
        }
    }

    // 胶囊关闭时通知主窗口
    let app_handle = app.clone();
    let label_clone = label.clone();
    let zone_clone = zone.to_string();
    let name_clone = name.to_string();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::Destroyed = event {
            stop_capsule_snap_watcher(&label_clone);
            if suppressed_capsule_close_events()
                .lock()
                .unwrap()
                .remove(&label_clone)
            {
                return;
            }
            if let Some(main) = app_handle.get_webview_window(WINDOW_LABEL) {
                let _ = main.emit(
                    "mknote:capsule-closed",
                    serde_json::json!({ "zone": zone_clone, "name": name_clone }),
                );
            }
        }
    });

    Ok(())
}

/// 前端胶囊窗口就绪后调用，按自身 label 取走初始化参数。
#[tauri::command]
pub fn take_capsule_init(label: String) -> Option<CapsuleInit> {
    pending_capsule_init().lock().unwrap().remove(&label)
}

/// 通知主窗口：弹出/胶囊窗口中的笔记已经重命名，需要同步隐藏 Tab 状态。
#[tauri::command]
pub async fn notify_popped_out_renamed(
    app: tauri::AppHandle,
    zone: String,
    old_name: String,
    new_name: String,
    title: String,
) -> Result<(), String> {
    crate::update_config(|config| {
        if let Some(sessions) = config.popout_sessions.as_mut() {
            for session in sessions.iter_mut() {
                if session.zone == zone && session.name == old_name {
                    session.name = new_name.clone();
                    session.title = title.clone();
                }
            }
        }
        if let Some(sessions) = config.capsule_sessions.as_mut() {
            for session in sessions.iter_mut() {
                if session.zone == zone && session.name == old_name {
                    session.name = new_name.clone();
                    session.title = title.clone();
                }
            }
        }
        Ok(())
    })?;
    register_popout_label_alias(&zone, &new_name, &popout_label(&zone, &old_name));
    rename_unified_window_note(&zone, &old_name, &new_name, &title);
    if let Some(main) = app.get_webview_window(WINDOW_LABEL) {
        let _ = main.emit(
            "mknote:popped-out-renamed",
            serde_json::json!({
                "zone": zone,
                "oldName": old_name,
                "newName": new_name,
                "title": title,
            }),
        );
    }
    Ok(())
}

/// 将 Popout 转为胶囊。
///
/// 这是窗口形态转换，不是关闭 Popout：主窗口中的 Tab 仍应保持 popped-out 状态。
#[tauri::command]
pub async fn restore_popout_to_capsule(
    app: tauri::AppHandle,
    zone: String,
    name: String,
    title: String,
    note_color: Option<String>,
    always_on_top: bool,
    anchor_x: f64,
    anchor_y: f64,
    source: Option<String>,
    popout_window_label: Option<String>,
) -> Result<(), String> {
    open_capsule(
        app.clone(),
        zone.clone(),
        name.clone(),
        title,
        note_color,
        always_on_top,
        anchor_x,
        anchor_y,
        source,
    )
    .await?;

    let label = popout_window_label.unwrap_or_else(|| popout_label(&zone, &name));
    if let Some(w) = app.get_webview_window(&label) {
        suppressed_popout_close_events()
            .lock()
            .unwrap()
            .insert(label.clone());
        if let Err(err) = w.destroy() {
            suppressed_popout_close_events()
                .lock()
                .unwrap()
                .remove(&label);
            return Err(err.to_string());
        }
    }
    remove_popout_label_alias(&zone, &name);
    remove_persisted_popout_session(&zone, &name)?;

    Ok(())
}

/// 将当前 Popout 窗口在同一个 native window 内折叠为胶囊形态。
///
/// 这是新统一窗口路径的实验命令：不创建 `capsule-*` 窗口，不销毁当前窗口，
/// 只记录 expanded 几何并 resize 当前 `popout-*` 窗口。
#[tauri::command]
pub async fn collapse_note_window_to_capsule(
    app: tauri::AppHandle,
    zone: String,
    name: String,
    title: String,
    always_on_top: bool,
    label: Option<String>,
) -> Result<(), String> {
    let window_label = label.unwrap_or_else(|| popout_label(&zone, &name));
    let Some(window) = app.get_webview_window(&window_label) else {
        return Err("window_not_found".into());
    };

    let expanded_geometry = freeze_expanded_geometry(&window_label, &zone, &name, &window);
    persist_popout_session(session_for_popout(
        &zone,
        &name,
        &title,
        always_on_top,
        expanded_geometry.clone(),
    ))?;

    let capsule_geometry = WindowGeometry {
        x: expanded_geometry.x,
        y: expanded_geometry.y,
        width: CAPSULE_WIDTH,
        height: CAPSULE_HEIGHT,
    };
    let mut state = UnifiedNoteWindowState {
        zone: zone.clone(),
        name: name.clone(),
        title: title.clone(),
        always_on_top,
        mode: UnifiedNoteWindowMode::TransitioningToCapsule,
        expanded_geometry: expanded_geometry.clone(),
        capsule_geometry: capsule_geometry.clone(),
        snap_edge: None,
    };
    unified_note_windows()
        .lock()
        .unwrap()
        .insert(window_label.clone(), state.clone());

    let _ = window.set_always_on_top(true);
    let _ = window.set_resizable(false);
    let _ = window.set_min_size(Some(tauri::LogicalSize::new(CAPSULE_WIDTH, CAPSULE_HEIGHT)));
    let _ = window.set_max_size(Some(tauri::LogicalSize::new(CAPSULE_WIDTH, CAPSULE_HEIGHT)));
    let _ = window.set_position(tauri::LogicalPosition::new(
        capsule_geometry.x,
        capsule_geometry.y,
    ));
    window
        .set_size(tauri::LogicalSize::new(CAPSULE_WIDTH, CAPSULE_HEIGHT))
        .map_err(|err| err.to_string())?;
    state.capsule_geometry = capsule_geometry;
    let _ = window.emit("mknote:unified-window-mode", unified_payload(&state));

    Ok(())
}

#[tauri::command]
pub async fn ack_unified_note_window_mode_ready(
    _app: tauri::AppHandle,
    label: String,
) -> Result<(), String> {
    if let Some(state) = unified_note_windows().lock().unwrap().get_mut(&label) {
        state.mode = match state.mode {
            UnifiedNoteWindowMode::TransitioningToCapsule => UnifiedNoteWindowMode::Capsule,
            UnifiedNoteWindowMode::TransitioningToExpanded => UnifiedNoteWindowMode::Expanded,
            mode => mode,
        };
    }
    Ok(())
}

#[tauri::command]
pub async fn settle_unified_note_capsule_position(
    app: tauri::AppHandle,
    label: String,
) -> Result<Option<String>, String> {
    let Some(window) = app.get_webview_window(&label) else {
        return Ok(None);
    };
    if left_mouse_button_down() {
        return Ok(None);
    }
    stop_capsule_snap_watcher(&label);

    let current = window_geometry(&window)?;
    let Some(monitor) = monitor_geometry_for_window(&window) else {
        if let Some(state) = unified_note_windows().lock().unwrap().get_mut(&label) {
            state.capsule_geometry = current;
            state.snap_edge = None;
        }
        let _ = window.emit("mknote:capsule-snap-changed", Option::<String>::None);
        return Ok(None);
    };
    let Some(snap) = resolve_capsule_snap(
        &current,
        &monitor,
        CAPSULE_SIDE_HANDLE_WIDTH,
        CAPSULE_TOP_HANDLE_HEIGHT,
    ) else {
        stop_capsule_snap_watcher(&label);
        if let Some(state) = unified_note_windows().lock().unwrap().get_mut(&label) {
            state.capsule_geometry = current;
            state.snap_edge = None;
        }
        let _ = window.emit("mknote:capsule-snap-changed", Option::<String>::None);
        return Ok(None);
    };

    let edge = snap.edge.as_str().to_string();
    if let Some(state) = unified_note_windows().lock().unwrap().get_mut(&label) {
        state.capsule_geometry = snap.visible.clone();
        state.snap_edge = Some(edge.clone());
    }
    let _ = window.emit("mknote:capsule-snap-changed", edge.clone());
    set_window_bounds(&window, &snap.hidden)?;
    start_capsule_snap_watcher(app.clone(), label, snap, false, true);
    Ok(Some(edge))
}

/// 将统一窗口胶囊形态恢复为 expanded Popout 形态。
#[tauri::command]
pub async fn expand_note_window_from_capsule(
    app: tauri::AppHandle,
    zone: String,
    name: String,
    title: String,
    always_on_top: bool,
    label: Option<String>,
) -> Result<(), String> {
    let window_label = label.unwrap_or_else(|| popout_label(&zone, &name));
    let Some(window) = app.get_webview_window(&window_label) else {
        return Err("window_not_found".into());
    };
    stop_capsule_snap_watcher(&window_label);
    let _ = window.emit("mknote:capsule-snap-changed", Option::<String>::None);

    let expanded_geometry = unified_note_windows()
        .lock()
        .unwrap()
        .get(&window_label)
        .map(|state| state.expanded_geometry.clone())
        .or_else(|| note_popout_session_geometry(&zone, &name))
        .unwrap_or(WindowGeometry {
            x: 0.0,
            y: 0.0,
            width: DEFAULT_POPOUT_WIDTH,
            height: DEFAULT_POPOUT_HEIGHT,
        });

    let width = expanded_geometry.width.max(DEFAULT_POPOUT_WIDTH);
    let height = expanded_geometry.height.max(DEFAULT_POPOUT_HEIGHT);
    let state = UnifiedNoteWindowState {
        zone: zone.clone(),
        name: name.clone(),
        title: title.clone(),
        always_on_top,
        mode: UnifiedNoteWindowMode::TransitioningToExpanded,
        expanded_geometry: WindowGeometry {
            width,
            height,
            ..expanded_geometry.clone()
        },
        capsule_geometry: window_geometry(&window).unwrap_or(WindowGeometry {
            x: expanded_geometry.x,
            y: expanded_geometry.y,
            width: CAPSULE_WIDTH,
            height: CAPSULE_HEIGHT,
        }),
        snap_edge: None,
    };
    unified_note_windows()
        .lock()
        .unwrap()
        .insert(window_label.clone(), state.clone());

    let _ = window.set_always_on_top(always_on_top);
    let _ = window.set_max_size(None::<tauri::LogicalSize<f64>>);
    let _ = window.set_min_size(Some(tauri::LogicalSize::new(
        DEFAULT_POPOUT_WIDTH,
        DEFAULT_POPOUT_HEIGHT,
    )));
    let _ = window.set_resizable(true);
    set_window_bounds(&window, &state.expanded_geometry)?;
    let _ = window.emit("mknote:unified-window-mode", unified_payload(&state));

    persist_popout_session(session_for_popout(
        &zone,
        &name,
        &title,
        always_on_top,
        WindowGeometry {
            width,
            height,
            ..expanded_geometry
        },
    ))
}

#[tauri::command]
pub async fn open_capsule(
    app: tauri::AppHandle,
    zone: String,
    name: String,
    title: String,
    note_color: Option<String>,
    always_on_top: bool,
    anchor_x: f64,
    anchor_y: f64,
    source: Option<String>,
) -> Result<(), String> {
    let _ = always_on_top;
    let always_on_top = true;
    let source = source.unwrap_or_else(|| "main".to_string());
    let from_popout = source == "popout";
    let capsule_x = if from_popout {
        anchor_x + POPOUT_TO_CAPSULE_TITLE_X_DELTA
    } else {
        anchor_x
    };
    let mut capsule_y = if from_popout {
        anchor_y
    } else {
        anchor_y - CAPSULE_HEIGHT - CAPSULE_GAP
    };
    if capsule_y < 0.0 {
        capsule_y = if from_popout {
            0.0
        } else {
            anchor_y + CAPSULE_GAP
        };
    }
    create_capsule_window(
        app,
        &zone,
        &name,
        &title,
        note_color,
        always_on_top,
        capsule_session_geometry(capsule_x, capsule_y),
        source,
        true,
        None,
    )
    .await
}

/// 将胶囊还原为便签弹出窗口。
///
/// 这是一个窗口语义转换，不是关闭胶囊：主窗口中的 Tab 应继续保持 popped-out 状态，
/// 直到 Popout 自身关闭时再通过 `mknote:popout-closed` 归还。
#[tauri::command]
pub async fn restore_capsule_to_popout(
    app: tauri::AppHandle,
    zone: String,
    name: String,
    title: String,
    width: f64,
    height: f64,
    x: Option<f64>,
    y: Option<f64>,
    capsule_window_label: Option<String>,
) -> Result<(), String> {
    let persisted_geometry = load_config().ok().and_then(|config| {
        config.capsule_sessions.and_then(|sessions| {
            sessions
                .into_iter()
                .find(|session| session.zone == zone && session.name == name)
                .map(|session| session.geometry)
        })
    });
    let restore_x = persisted_geometry.as_ref().map(|geometry| geometry.x).or(x);
    let restore_y = persisted_geometry.as_ref().map(|geometry| geometry.y).or(y);
    match open_note_popout(
        app.clone(),
        zone.clone(),
        name.clone(),
        title,
        width,
        height,
        restore_x,
        restore_y,
        Some(false),
    )
    .await
    {
        Ok(()) => {}
        Err(err) if err == "already_open" => {}
        Err(err) => return Err(err),
    }

    let label = capsule_window_label.unwrap_or_else(|| capsule_label(&zone, &name));
    if let Some(w) = app.get_webview_window(&label) {
        stop_capsule_snap_watcher(&label);
        suppressed_capsule_close_events()
            .lock()
            .unwrap()
            .insert(label.clone());
        if let Err(err) = w.destroy() {
            suppressed_capsule_close_events()
                .lock()
                .unwrap()
                .remove(&label);
            return Err(err.to_string());
        }
    }
    remove_persisted_capsule_session(&zone, &name);

    Ok(())
}

/// 关闭指定笔记的胶囊窗口（由胶囊自身的关闭按钮调用）。
#[tauri::command]
pub async fn close_capsule(
    app: tauri::AppHandle,
    zone: String,
    name: String,
    label: Option<String>,
) -> Result<(), String> {
    let window_label = label.unwrap_or_else(|| capsule_label(&zone, &name));
    if let Some(w) = app.get_webview_window(&window_label) {
        stop_capsule_snap_watcher(&window_label);
        if let Some(main) = app.get_webview_window(WINDOW_LABEL) {
            let _ = main.emit(
                "mknote:capsule-closed",
                serde_json::json!({ "zone": zone, "name": name }),
            );
        }
        suppressed_capsule_close_events()
            .lock()
            .unwrap()
            .insert(window_label.clone());
        if let Err(err) = w.destroy() {
            suppressed_capsule_close_events()
                .lock()
                .unwrap()
                .remove(&window_label);
            return Err(err.to_string());
        }
    }
    remove_persisted_capsule_session(&zone, &name);
    Ok(())
}

#[tauri::command]
pub async fn settle_capsule_position(
    app: tauri::AppHandle,
    zone: String,
    name: String,
    label: String,
) -> Result<Option<String>, String> {
    let Some(window) = app.get_webview_window(&label) else {
        return Ok(None);
    };
    if left_mouse_button_down() {
        return Ok(None);
    }
    stop_capsule_snap_watcher(&label);

    let current = window_geometry(&window)?;
    let config = load_config()?;
    let existing = config.capsule_sessions.as_ref().and_then(|sessions| {
        sessions
            .iter()
            .find(|item| item.zone == zone && item.name == name)
            .cloned()
    });

    let mut session = existing.unwrap_or_else(|| {
        session_for_capsule(&zone, &name, &name, None, true, current.clone(), None)
    });

    if config.capsule_snap_enabled {
        if let Some(monitor) = monitor_geometry_for_window(&window) {
            if let Some(snap) = resolve_capsule_snap(
                &current,
                &monitor,
                CAPSULE_SIDE_HANDLE_WIDTH,
                CAPSULE_TOP_HANDLE_HEIGHT,
            ) {
                let _ = window.emit("mknote:capsule-snap-changed", snap.edge.as_str());
                set_window_bounds(&window, &snap.hidden)?;
                start_capsule_snap_watcher(app.clone(), label, snap.clone(), false, true);
                session.geometry = snap.visible;
                session.snap_edge = Some(snap.edge.as_str().to_string());
                crate::update_config(|config| {
                    upsert_capsule_session(config, session.clone());
                    Ok(())
                })?;
                return Ok(Some(snap.edge.as_str().to_string()));
            }
        }
    }

    stop_capsule_snap_watcher(&label);
    let _ = window.emit("mknote:capsule-snap-changed", Option::<String>::None);
    session.geometry = current;
    session.snap_edge = None;
    crate::update_config(|config| {
        upsert_capsule_session(config, session);
        Ok(())
    })?;
    Ok(None)
}

#[tauri::command]
pub async fn begin_capsule_drag(app: tauri::AppHandle, label: String) -> Result<(), String> {
    stop_capsule_snap_watcher(&label);
    if let Some(window) = app.get_webview_window(&label) {
        let _ = window.emit("mknote:capsule-snap-changed", Option::<String>::None);
    }
    Ok(())
}

#[tauri::command]
pub async fn set_capsule_always_on_top(
    app: tauri::AppHandle,
    zone: String,
    name: String,
    label: String,
    always_on_top: bool,
) -> Result<(), String> {
    let window = app.get_webview_window(&label);
    if let Some(window) = &window {
        window
            .set_always_on_top(always_on_top)
            .map_err(|e| e.to_string())?;
    }

    let config = load_config()?;
    let existing = config.capsule_sessions.as_ref().and_then(|sessions| {
        sessions
            .iter()
            .find(|item| item.zone == zone && item.name == name)
            .cloned()
    });
    let geometry = window
        .as_ref()
        .and_then(|window| window_geometry(window).ok())
        .or_else(|| existing.as_ref().map(|session| session.geometry.clone()))
        .unwrap_or_else(|| capsule_session_geometry(0.0, 0.0));
    let fallback = existing.unwrap_or_else(|| {
        session_for_capsule(&zone, &name, &name, None, always_on_top, geometry, None)
    });

    crate::update_config(|config| {
        set_capsule_session_always_on_top(config, fallback, always_on_top);
        Ok(())
    })
    .map(|_| ())
}

#[tauri::command]
pub async fn settle_popout_geometry(
    app: tauri::AppHandle,
    zone: String,
    name: String,
    label: String,
    title: String,
) -> Result<(), String> {
    let Some(window) = app.get_webview_window(&label) else {
        return Ok(());
    };
    if !is_unified_expanded_mode(&label) {
        return Ok(());
    }
    if left_mouse_button_down() {
        return Ok(());
    }
    let geometry = window_geometry(&window)?;
    let config = load_config()?;
    let existing = config.popout_sessions.as_ref().and_then(|sessions| {
        sessions
            .iter()
            .find(|item| item.zone == zone && item.name == name)
            .cloned()
    });
    let always_on_top = existing
        .as_ref()
        .map(|session| session.always_on_top)
        .unwrap_or(false);
    let mut session = existing.unwrap_or_else(|| {
        session_for_popout(&zone, &name, &title, always_on_top, geometry.clone())
    });
    session.title = title;
    session.geometry = geometry;
    crate::update_config(|config| {
        upsert_popout_session(config, session);
        Ok(())
    })
    .map(|_| ())
}

#[tauri::command]
pub async fn set_popout_always_on_top(
    app: tauri::AppHandle,
    zone: String,
    name: String,
    label: String,
    title: String,
    always_on_top: bool,
) -> Result<(), String> {
    let window = app.get_webview_window(&label);
    if let Some(window) = &window {
        window
            .set_always_on_top(always_on_top)
            .map_err(|e| e.to_string())?;
    }

    let config = load_config()?;
    let existing = config.popout_sessions.as_ref().and_then(|sessions| {
        sessions
            .iter()
            .find(|item| item.zone == zone && item.name == name)
            .cloned()
    });
    let geometry = window
        .as_ref()
        .and_then(|window| window_geometry(window).ok())
        .or_else(|| existing.as_ref().map(|session| session.geometry.clone()))
        .unwrap_or(WindowGeometry {
            x: 0.0,
            y: 0.0,
            width: 500.0,
            height: 400.0,
        });
    let mut session = existing
        .unwrap_or_else(|| session_for_popout(&zone, &name, &title, always_on_top, geometry));
    session.always_on_top = always_on_top;
    session.title = title;
    crate::update_config(|config| {
        upsert_popout_session(config, session);
        Ok(())
    })
    .map(|_| ())
}

#[tauri::command]
pub async fn hide_capsule_snap(
    app: tauri::AppHandle,
    zone: String,
    name: String,
    label: String,
) -> Result<(), String> {
    let Some(window) = app.get_webview_window(&label) else {
        return Ok(());
    };
    let config = load_config()?;
    let Some(session) = config.capsule_sessions.as_ref().and_then(|sessions| {
        sessions
            .iter()
            .find(|item| item.zone == zone && item.name == name)
            .cloned()
    }) else {
        return Ok(());
    };
    let Some(edge) = session
        .snap_edge
        .as_deref()
        .and_then(CapsuleSnapEdge::from_str)
    else {
        return Ok(());
    };
    let Some(monitor) = monitor_geometry_for_window(&window) else {
        return Ok(());
    };
    if let Some(snap) = capsule_snap_for_edge(
        edge,
        &session.geometry,
        &monitor,
        CAPSULE_SIDE_HANDLE_WIDTH,
        CAPSULE_TOP_HANDLE_HEIGHT,
    ) {
        animate_window_to(&window, &snap.hidden);
        let _ = window.emit("mknote:capsule-snap-changed", snap.edge.as_str());
        start_capsule_snap_watcher(app.clone(), label, snap, false, true);
    }
    Ok(())
}

#[tauri::command]
pub async fn show_capsule_snap(
    app: tauri::AppHandle,
    zone: String,
    name: String,
    label: String,
) -> Result<(), String> {
    let Some(window) = app.get_webview_window(&label) else {
        return Ok(());
    };
    let config = load_config()?;
    let Some(session) = config.capsule_sessions.as_ref().and_then(|sessions| {
        sessions
            .iter()
            .find(|item| item.zone == zone && item.name == name)
            .cloned()
    }) else {
        return Ok(());
    };
    let Some(edge) = session
        .snap_edge
        .as_deref()
        .and_then(CapsuleSnapEdge::from_str)
    else {
        return Ok(());
    };
    let Some(monitor) = monitor_geometry_for_window(&window) else {
        return Ok(());
    };
    if let Some(snap) = capsule_snap_for_edge(
        edge,
        &session.geometry,
        &monitor,
        CAPSULE_SIDE_HANDLE_WIDTH,
        CAPSULE_TOP_HANDLE_HEIGHT,
    ) {
        animate_window_to(&window, &snap.visible);
        let _ = window.emit("mknote:capsule-snap-changed", snap.edge.as_str());
        start_capsule_snap_watcher(app.clone(), label, snap, true, false);
    }
    Ok(())
}

pub async fn restore_capsules_from_config(app: tauri::AppHandle) -> Result<(), String> {
    let config = load_config()?;
    let Some(sessions) = config.capsule_sessions.clone() else {
        return Ok(());
    };
    for session in sessions {
        let _ = create_capsule_window(
            app.clone(),
            &session.zone,
            &session.name,
            &session.title,
            session.note_color.clone(),
            session.always_on_top,
            session.geometry.clone(),
            "main".to_string(),
            false,
            session.snap_edge.clone(),
        )
        .await;
    }
    Ok(())
}

pub async fn restore_popouts_from_config(app: tauri::AppHandle) -> Result<(), String> {
    let config = load_config()?;
    let Some(sessions) = config.popout_sessions.clone() else {
        return Ok(());
    };
    for session in sessions {
        let _ = open_note_popout(
            app.clone(),
            session.zone.clone(),
            session.name.clone(),
            session.title.clone(),
            session.geometry.width,
            session.geometry.height,
            Some(session.geometry.x),
            Some(session.geometry.y),
            Some(false),
        )
        .await;
        let label = popout_label(&session.zone, &session.name);
        if let Some(window) = app.get_webview_window(&label) {
            let _ = window.set_always_on_top(session.always_on_top);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{AppConfig, CapsuleSessionRef, WindowGeometry};

    fn geom(x: f64, y: f64, width: f64, height: f64) -> WindowGeometry {
        WindowGeometry {
            x,
            y,
            width,
            height,
        }
    }

    #[test]
    fn capsule_snap_hides_to_left_edge_with_readable_side_handle() {
        let monitor = geom(0.0, 0.0, 1920.0, 1080.0);
        let current = geom(-12.0, 300.0, 240.0, 40.0);

        let snap = resolve_capsule_snap(
            &current,
            &monitor,
            CAPSULE_SIDE_HANDLE_WIDTH,
            CAPSULE_TOP_HANDLE_HEIGHT,
        )
        .unwrap();

        assert_eq!(snap.edge, CapsuleSnapEdge::Left);
        assert_eq!(snap.visible.x, 0.0);
        assert_eq!(snap.visible.y, 300.0);
        assert_eq!(snap.hidden.x, -132.0);
        assert_eq!(snap.hidden.y, 300.0);
    }

    #[test]
    fn capsule_snap_picks_nearest_supported_edge() {
        let monitor = geom(0.0, 0.0, 1920.0, 1080.0);
        let current = geom(1600.0, -12.0, 240.0, 40.0);

        let snap = resolve_capsule_snap(
            &current,
            &monitor,
            CAPSULE_SIDE_HANDLE_WIDTH,
            CAPSULE_TOP_HANDLE_HEIGHT,
        )
        .unwrap();

        assert_eq!(snap.edge, CapsuleSnapEdge::Top);
        assert_eq!(snap.visible.x, 1600.0);
        assert_eq!(snap.visible.y, 0.0);
        assert_eq!(snap.hidden.x, 1600.0);
        assert_eq!(snap.hidden.y, -32.0);
    }

    #[test]
    fn capsule_snap_returns_none_when_inside_screen_near_edge() {
        let monitor = geom(0.0, 0.0, 1920.0, 1080.0);
        let current = geom(24.0, 16.0, 240.0, 40.0);

        assert!(resolve_capsule_snap(
            &current,
            &monitor,
            CAPSULE_SIDE_HANDLE_WIDTH,
            CAPSULE_TOP_HANDLE_HEIGHT
        )
        .is_none());
    }

    #[test]
    fn capsule_snap_requires_actual_screen_overflow() {
        let monitor = geom(0.0, 0.0, 1920.0, 1080.0);
        let current = geom(4.0, 300.0, 240.0, 40.0);
        assert!(resolve_capsule_snap(
            &current,
            &monitor,
            CAPSULE_SIDE_HANDLE_WIDTH,
            CAPSULE_TOP_HANDLE_HEIGHT,
        )
        .is_none());

        let overflowing = geom(-1.0, 300.0, 240.0, 40.0);
        assert_eq!(
            resolve_capsule_snap(
                &overflowing,
                &monitor,
                CAPSULE_SIDE_HANDLE_WIDTH,
                CAPSULE_TOP_HANDLE_HEIGHT,
            )
            .unwrap()
            .edge,
            CapsuleSnapEdge::Left
        );
    }

    #[test]
    fn capsule_snap_returns_none_when_far_from_edges() {
        let monitor = geom(0.0, 0.0, 1920.0, 1080.0);
        let current = geom(300.0, 260.0, 240.0, 40.0);

        assert!(resolve_capsule_snap(
            &current,
            &monitor,
            CAPSULE_SIDE_HANDLE_WIDTH,
            CAPSULE_TOP_HANDLE_HEIGHT
        )
        .is_none());
    }

    #[test]
    fn capsule_sessions_upsert_and_remove_by_note_key() {
        let mut config = AppConfig::default();
        let first = CapsuleSessionRef {
            zone: "default".to_string(),
            name: "a.md".to_string(),
            title: "A".to_string(),
            note_color: None,
            always_on_top: true,
            geometry: geom(10.0, 20.0, 240.0, 40.0),
            snap_edge: None,
        };
        let moved = CapsuleSessionRef {
            geometry: geom(30.0, 40.0, 240.0, 40.0),
            ..first.clone()
        };

        upsert_capsule_session(&mut config, first);
        upsert_capsule_session(&mut config, moved);

        let sessions = config.capsule_sessions.as_ref().unwrap();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].geometry.x, 30.0);

        remove_capsule_session(&mut config, "default", "a.md");
        assert!(config.capsule_sessions.as_ref().is_none_or(Vec::is_empty));
    }

    #[test]
    fn capsule_session_pin_state_updates_existing_session() {
        let mut config = AppConfig::default();
        let session = CapsuleSessionRef {
            zone: "default".to_string(),
            name: "a.md".to_string(),
            title: "A".to_string(),
            note_color: Some("red".to_string()),
            always_on_top: true,
            geometry: geom(10.0, 20.0, 240.0, 40.0),
            snap_edge: Some("left".to_string()),
        };
        upsert_capsule_session(&mut config, session.clone());

        set_capsule_session_always_on_top(&mut config, session, false);

        let updated = &config.capsule_sessions.as_ref().unwrap()[0];
        assert!(!updated.always_on_top);
        assert_eq!(updated.geometry.x, 10.0);
        assert_eq!(updated.snap_edge.as_deref(), Some("left"));
    }

    #[test]
    fn unified_window_blocks_expanded_geometry_writes_while_transitioning() {
        let label = "popout-default-note.md".to_string();
        let state = UnifiedNoteWindowState {
            zone: "default".to_string(),
            name: "note.md".to_string(),
            title: "note".to_string(),
            always_on_top: false,
            mode: UnifiedNoteWindowMode::TransitioningToCapsule,
            expanded_geometry: geom(20.0, 30.0, 500.0, 400.0),
            capsule_geometry: geom(20.0, 30.0, 240.0, 40.0),
            snap_edge: None,
        };

        unified_note_windows()
            .lock()
            .unwrap()
            .insert(label.clone(), state);
        assert!(!is_unified_expanded_mode(&label));

        unified_note_windows()
            .lock()
            .unwrap()
            .get_mut(&label)
            .unwrap()
            .mode = UnifiedNoteWindowMode::Expanded;
        assert!(is_unified_expanded_mode(&label));

        unified_note_windows().lock().unwrap().remove(&label);
    }

    #[test]
    fn renamed_unified_window_keeps_native_label_for_later_close() {
        let label = "popout-default-old.md".to_string();
        unified_note_windows().lock().unwrap().insert(
            label.clone(),
            UnifiedNoteWindowState {
                zone: "default".to_string(),
                name: "old.md".to_string(),
                title: "旧标题".to_string(),
                always_on_top: false,
                mode: UnifiedNoteWindowMode::Expanded,
                expanded_geometry: geom(0.0, 0.0, 500.0, 400.0),
                capsule_geometry: geom(0.0, 0.0, 240.0, 40.0),
                snap_edge: None,
            },
        );

        rename_unified_window_note("default", "old.md", "new.md", "新标题");

        assert_eq!(unified_window_label_for_note("default", "new.md"), label);
        unified_note_windows().lock().unwrap().remove(&label);
    }

    #[test]
    fn renamed_popout_alias_resolves_the_original_native_label() {
        let label = popout_label("default", "old.md");
        register_popout_label_alias("default", "new.md", &label);

        assert_eq!(unified_window_label_for_note("default", "new.md"), label);
        remove_popout_label_alias("default", "new.md");
    }

    #[test]
    fn manually_destroyed_popout_is_suppressed_once() {
        let label = "test-popout-suppressed";
        suppress_popout_close_event(label);
        assert!(suppressed_popout_close_events()
            .lock()
            .unwrap()
            .remove(label));
        unsuppress_popout_close_event(label);
    }
}
