use crate::paths;
use crate::{load_config, AppConfig, WindowGeometry};
#[cfg(desktop)]
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{atomic::AtomicBool, Arc};
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Runtime, WebviewWindow,
};
use tauri_plugin_autostart::ManagerExt;
#[cfg(desktop)]
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

use crate::win_present::{
    ensure_window_on_screen, force_present_window, is_native_foreground, is_native_presented,
    show_window_no_activate,
};

pub const WINDOW_LABEL: &str = "main";

#[derive(Clone, Debug, PartialEq, Eq)]
enum CliAction {
    Hide,
    Toggle,
    QuickTodo,
    ToggleQuickTodo,
    QuickTodoById(String),
    ToggleQuickTodoById(String),
    QuickPocket,
    ToggleQuickPocket,
    QuickPocketById(String),
    ToggleQuickPocketById(String),
    NewNote(&'static str),
    Show,
    Quit,
}

fn parse_cli_action(argv: &[String]) -> CliAction {
    let args: std::collections::HashSet<String> = argv
        .iter()
        .map(|s| s.trim_start_matches('-').to_lowercase())
        .collect();

    if args.contains("hide") {
        CliAction::Hide
    } else if args.contains("toggle") {
        CliAction::Toggle
    } else if let Some(todo_id) = cli_flag_value(argv, "toggle-quick-todo") {
        CliAction::ToggleQuickTodoById(todo_id)
    } else if args.contains("toggle-quick-todo") {
        CliAction::ToggleQuickTodo
    } else if let Some(todo_id) = cli_flag_value(argv, "quick-todo") {
        CliAction::QuickTodoById(todo_id)
    } else if args.contains("quick-todo") {
        CliAction::QuickTodo
    } else if let Some(pocket_id) = cli_flag_value(argv, "toggle-quick-pocket") {
        CliAction::ToggleQuickPocketById(pocket_id)
    } else if args.contains("toggle-quick-pocket") {
        CliAction::ToggleQuickPocket
    } else if let Some(pocket_id) = cli_flag_value(argv, "quick-pocket") {
        CliAction::QuickPocketById(pocket_id)
    } else if args.contains("quick-pocket") {
        CliAction::QuickPocket
    } else if args.contains("new-inbox") {
        CliAction::NewNote("inbox")
    } else if args.contains("new-note") {
        CliAction::NewNote("default")
    } else if args.contains("quit") {
        CliAction::Quit
    } else {
        CliAction::Show
    }
}

fn cli_flag_value(argv: &[String], flag: &str) -> Option<String> {
    for (index, raw) in argv.iter().enumerate() {
        let argument = raw.trim_start_matches('-');
        if let Some((name, value)) = argument.split_once('=') {
            if name.eq_ignore_ascii_case(flag) && !value.is_empty() {
                return Some(value.to_string());
            }
        } else if argument.eq_ignore_ascii_case(flag) {
            if let Some(value) = argv.get(index + 1).filter(|value| !value.starts_with('-')) {
                return Some(value.clone());
            }
        }
    }
    None
}

#[cfg(test)]
mod cli_tests {
    use super::{parse_cli_action, CliAction};

    #[test]
    fn defaults_to_show_when_started_without_arguments() {
        assert_eq!(parse_cli_action(&[]), CliAction::Show);
    }

    #[test]
    fn parses_quit_cli_action_with_or_without_dashes() {
        assert_eq!(parse_cli_action(&["--quit".into()]), CliAction::Quit);
        assert_eq!(parse_cli_action(&["quit".into()]), CliAction::Quit);
    }

    #[test]
    fn parses_quick_todo_cli_action_with_or_without_dashes() {
        assert_eq!(
            parse_cli_action(&["--quick-todo".into()]),
            CliAction::QuickTodo
        );
        assert_eq!(
            parse_cli_action(&["quick-todo".into()]),
            CliAction::QuickTodo
        );
    }

    #[test]
    fn parses_toggle_quick_todo_cli_action_with_or_without_dashes() {
        assert_eq!(
            parse_cli_action(&["--toggle-quick-todo".into()]),
            CliAction::ToggleQuickTodo
        );
        assert_eq!(
            parse_cli_action(&["toggle-quick-todo".into()]),
            CliAction::ToggleQuickTodo
        );
    }

    #[test]
    fn parses_todo_id_from_equals_or_separate_cli_argument() {
        assert_eq!(
            parse_cli_action(&["--quick-todo=todo_work".into()]),
            CliAction::QuickTodoById("todo_work".into())
        );
        assert_eq!(
            parse_cli_action(&["--toggle-quick-todo".into(), "todo_home".into()]),
            CliAction::ToggleQuickTodoById("todo_home".into())
        );
    }

    #[test]
    fn parses_quick_pocket_cli_actions_with_or_without_dashes() {
        assert_eq!(
            parse_cli_action(&["--quick-pocket".into()]),
            CliAction::QuickPocket
        );
        assert_eq!(
            parse_cli_action(&["quick-pocket".into()]),
            CliAction::QuickPocket
        );
        assert_eq!(
            parse_cli_action(&["--toggle-quick-pocket".into()]),
            CliAction::ToggleQuickPocket
        );
        assert_eq!(
            parse_cli_action(&["toggle-quick-pocket".into()]),
            CliAction::ToggleQuickPocket
        );
    }

    #[test]
    fn parses_pocket_id_from_equals_or_separate_cli_argument() {
        assert_eq!(
            parse_cli_action(&["--quick-pocket=p_abc".into()]),
            CliAction::QuickPocketById("p_abc".into())
        );
        assert_eq!(
            parse_cli_action(&["--toggle-quick-pocket".into(), "p_xyz".into()]),
            CliAction::ToggleQuickPocketById("p_xyz".into())
        );
    }
}

/// 解析二次启动传入的命令行参数并执行对应操作。
///
/// 支持的参数（带 `--` 前缀或不带均可）：
///   --show      显示窗口
///   --hide      隐藏窗口到托盘
///   --toggle    有则隐藏，无则显示（默认行为）
///   --quick-todo[=TODO_ID] 打开或聚焦 Quick Todo 窗口
///   --toggle-quick-todo[=TODO_ID] 切换 Quick Todo 窗口的显示状态
///   --quick-pocket[=POCKET_ID] 打开或聚焦 Quick Pocket 窗口
///   --toggle-quick-pocket[=POCKET_ID] 切换 Quick Pocket 窗口的显示状态
///   --new-note  显示窗口并新建一条 Default 区笔记
///   --new-inbox 显示窗口并新建一条 Inbox 区笔记
///   --quit      请求前端 flush 后退出
///
/// 无参数或参数未匹配时默认执行 show。
pub fn handle_cli_args<R: Runtime>(app: &AppHandle<R>, argv: &[String]) {
    match parse_cli_action(argv) {
        CliAction::Hide => hide_main_window(app),
        CliAction::Toggle => toggle_main_window(app),
        CliAction::QuickTodo => {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(error) = crate::quick_todo_window::open_quick_todo_window_for_runtime(
                    app,
                    crate::quick_todo::DEFAULT_QUICK_TODO_ID.to_string(),
                )
                .await
                {
                    eprintln!("CLI 打开 Quick Todo 失败：{error}");
                }
            });
        }
        CliAction::QuickTodoById(todo_id) => {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(error) =
                    crate::quick_todo_window::open_quick_todo_window_for_runtime(app, todo_id).await
                {
                    eprintln!("CLI 打开指定 Quick Todo 失败：{error}");
                }
            });
        }
        CliAction::ToggleQuickTodo => {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(error) = crate::quick_todo_window::toggle_quick_todo_window_for_runtime(
                    app,
                    crate::quick_todo::DEFAULT_QUICK_TODO_ID.to_string(),
                )
                .await
                {
                    eprintln!("CLI 切换 Quick Todo 失败：{error}");
                }
            });
        }
        CliAction::ToggleQuickTodoById(todo_id) => {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(error) =
                    crate::quick_todo_window::toggle_quick_todo_window_for_runtime(app, todo_id)
                        .await
                {
                    eprintln!("CLI 切换指定 Quick Todo 失败：{error}");
                }
            });
        }
        CliAction::QuickPocket => {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(error) =
                    crate::quick_pocket_window::open_quick_pocket_window_for_runtime(
                        app,
                        crate::quick_pocket::DEFAULT_QUICK_POCKET_ID.to_string(),
                    )
                    .await
                {
                    eprintln!("CLI 打开 Quick Pocket 失败：{error}");
                }
            });
        }
        CliAction::QuickPocketById(pocket_id) => {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(error) =
                    crate::quick_pocket_window::open_quick_pocket_window_for_runtime(app, pocket_id)
                        .await
                {
                    eprintln!("CLI 打开指定 Quick Pocket 失败：{error}");
                }
            });
        }
        CliAction::ToggleQuickPocket => {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(error) =
                    crate::quick_pocket_window::toggle_quick_pocket_window_for_runtime(
                        app,
                        crate::quick_pocket::DEFAULT_QUICK_POCKET_ID.to_string(),
                    )
                    .await
                {
                    eprintln!("CLI 切换 Quick Pocket 失败：{error}");
                }
            });
        }
        CliAction::ToggleQuickPocketById(pocket_id) => {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(error) =
                    crate::quick_pocket_window::toggle_quick_pocket_window_for_runtime(
                        app, pocket_id,
                    )
                    .await
                {
                    eprintln!("CLI 切换指定 Quick Pocket 失败：{error}");
                }
            });
        }
        CliAction::NewNote(zone) => {
            show_main_window(app);
            if let Some(window) = main_window(app) {
                let _ = window.emit("mknote:new-note", zone);
            }
        }
        CliAction::Quit => {
            if let Some(window) = main_window(app) {
                let _ = window.emit("mknote:request-quit", ());
            } else {
                app.exit(0);
            }
        }
        CliAction::Show => show_main_window(app),
    }
}

const COMPACT_MIN_WIDTH: f64 = 700.0;
const COMPACT_MIN_HEIGHT: f64 = 440.0;
const DEFAULT_COMPACT_WIDTH: f64 = 760.0;
const DEFAULT_COMPACT_HEIGHT: f64 = 640.0;

fn is_valid_compact_geometry(geom: &WindowGeometry) -> bool {
    geom.width >= COMPACT_MIN_WIDTH - 1.0 && geom.height >= COMPACT_MIN_HEIGHT - 1.0
}

/// 解析应恢复的紧凑窗口尺寸（忽略 logo 迷你模式的 52×52 等小尺寸）。
fn resolve_compact_geometry(config: &AppConfig) -> WindowGeometry {
    if let Some(geom) = config.window.as_ref() {
        if is_valid_compact_geometry(geom) {
            return geom.clone();
        }
    }
    if let Some(geom) = config.compact_geometry.as_ref() {
        if is_valid_compact_geometry(geom) {
            return geom.clone();
        }
    }
    let (x, y) = config
        .window
        .as_ref()
        .map(|g| (g.x, g.y))
        .unwrap_or((100.0, 100.0));
    WindowGeometry {
        x,
        y,
        width: DEFAULT_COMPACT_WIDTH,
        height: DEFAULT_COMPACT_HEIGHT,
    }
}

/// 修正 config 中已写入的迷你窗/异常尺寸，避免开机自启出现窄条。
pub fn sanitize_window_geometry(config: &mut AppConfig) -> bool {
    let resolved = resolve_compact_geometry(config);
    let needs_fix = config
        .window
        .as_ref()
        .map(|g| !is_valid_compact_geometry(g))
        .unwrap_or(false);
    if needs_fix {
        config.window = Some(resolved.clone());
        if config
            .compact_geometry
            .as_ref()
            .map(|g| !is_valid_compact_geometry(g))
            .unwrap_or(true)
        {
            config.compact_geometry = Some(resolved);
        }
        return true;
    }
    false
}

pub fn setup<R: Runtime>(app: &AppHandle<R>) -> Result<(), Box<dyn std::error::Error>> {
    let (mut config, _) = paths::ensure_app_dirs(app)?;

    if let Ok(updated) = persist_compact_layout() {
        config = updated;
    } else {
        eprintln!("保存紧凑布局失败，继续使用当前配置");
    }
    if sanitize_window_geometry(&mut config) {
        let desired_window = config.window.clone();
        let desired_compact = config.compact_geometry.clone();
        if let Ok(updated) = crate::update_config(|current| {
            current.window = desired_window.clone();
            current.compact_geometry = desired_compact.clone();
            Ok(())
        }) {
            config = updated;
        }
    }
    if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
        window.set_decorations(false)?;
        window.set_always_on_top(config.always_on_top)?;
        apply_layout_min_size(&window, "compact");
        restore_window_geometry(&window, &config);
    }

    if let Err(e) = apply_autostart(app, config.autostart) {
        eprintln!("开机自启初始化跳过: {e}");
    }

    setup_tray(app, config.autostart)?;
    if let Err(error) = crate::clip_server::ensure_clip_server(app) {
        eprintln!("剪藏服务初始化跳过: {error}");
    }
    #[cfg(desktop)]
    register_global_hotkeys(app);

    if let Ok(base) = paths::writable_base(app) {
        let _ = app.asset_protocol_scope().allow_directory(&base, true);
    }

    // 启动全屏避让后台轮询线程（始终启动；线程内部检查开关状态）
    let watcher_running = Arc::new(AtomicBool::new(true));
    crate::fullscreen_watcher::spawn_fullscreen_watcher(app.clone(), watcher_running);

    Ok(())
}

#[cfg(desktop)]
fn hotkey_to_plugin(s: &str) -> String {
    s.split('+')
        .map(|p| p.trim().to_lowercase())
        .filter(|p| !p.is_empty())
        .collect::<Vec<_>>()
        .join("+")
}

#[cfg(desktop)]
fn hotkey_to_display(s: &str) -> String {
    s.split('+')
        .map(|p| {
            let p = p.trim();
            let mut c = p.chars();
            match c.next() {
                None => String::new(),
                Some(f) => f.to_uppercase().to_string() + c.as_str(),
            }
        })
        .filter(|p| !p.is_empty())
        .collect::<Vec<_>>()
        .join("+")
}

#[cfg(desktop)]
static LAST_CLIPBOARD_HOTKEY_MS: AtomicU64 = AtomicU64::new(0);

#[cfg(desktop)]
fn clipboard_hotkey_debounce_ok() -> bool {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let last = LAST_CLIPBOARD_HOTKEY_MS.load(Ordering::Relaxed);
    if now.saturating_sub(last) < 2000 {
        return false;
    }
    LAST_CLIPBOARD_HOTKEY_MS.store(now, Ordering::Relaxed);
    true
}

/// 注册全局热键：显示/隐藏、剪贴板收集、全文搜索（不含快速捕获）。
#[cfg(desktop)]
pub fn register_global_hotkeys<R: Runtime>(app: &AppHandle<R>) {
    let Ok(mut config) = load_config() else {
        eprintln!("读取配置失败，跳过全局热键注册");
        return;
    };
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();

    register_toggle_hotkey(&gs, &mut config);
    register_focus_hotkey(app, &gs, &config.global_hotkeys.focus_window);
    register_clipboard_hotkey(app, &gs, &config.global_hotkeys.clipboard_inbox);
    register_search_hotkey(app, &gs, &config.global_hotkeys.quick_search);
}

#[cfg(desktop)]
fn register_toggle_hotkey<R: Runtime>(
    gs: &tauri_plugin_global_shortcut::GlobalShortcut<R>,
    config: &mut AppConfig,
) {
    let mut candidates: Vec<String> = Vec::new();
    let primary = hotkey_to_plugin(&config.global_hotkeys.toggle_window);
    if !primary.is_empty() {
        candidates.push(primary);
    }
    for fallback in ["ctrl+shift+alt+n", "ctrl+shift+m", "ctrl+alt+grave"] {
        let s = fallback.to_string();
        if !candidates.contains(&s) {
            candidates.push(s);
        }
    }

    for hotkey in &candidates {
        let _ = gs.unregister(hotkey.as_str());
        match gs.on_shortcut(hotkey.as_str(), |app, _, event| {
            if event.state == ShortcutState::Pressed {
                toggle_main_window(app);
            }
        }) {
            Ok(()) => {
                let display = hotkey_to_display(hotkey);
                println!("全局热键（窗口）已注册: {display}");
                if config.global_hotkeys.toggle_window != display {
                    config.global_hotkeys.toggle_window = display;
                    let _ = crate::update_config(|current| {
                        current.global_hotkeys.toggle_window =
                            config.global_hotkeys.toggle_window.clone();
                        Ok(())
                    });
                }
                return;
            }
            Err(e) => {
                eprintln!("尝试注册窗口热键 {hotkey} 失败: {e}");
            }
        }
    }
    eprintln!("未找到可用的窗口切换热键，请使用托盘左键切换窗口。");
}

#[cfg(desktop)]
fn register_clipboard_hotkey<R: Runtime>(
    _app: &AppHandle<R>,
    gs: &tauri_plugin_global_shortcut::GlobalShortcut<R>,
    display: &str,
) {
    let hotkey = hotkey_to_plugin(display);
    if hotkey.is_empty() {
        return;
    }
    let _ = gs.unregister(hotkey.as_str());
    match gs.on_shortcut(hotkey.as_str(), move |app, _, event| {
        if event.state != ShortcutState::Pressed {
            return;
        }
        if !clipboard_hotkey_debounce_ok() {
            return;
        }
        show_main_window(&app);
        if let Err(e) = crate::capture::clipboard_inbox(&app) {
            eprintln!("剪贴板收集失败: {e}");
        }
    }) {
        Ok(()) => println!("全局热键（剪贴板）已注册: {}", hotkey_to_display(&hotkey)),
        Err(e) => eprintln!("剪贴板热键 {hotkey} 注册失败: {e}"),
    }
}

#[cfg(desktop)]
fn register_focus_hotkey<R: Runtime>(
    _app: &AppHandle<R>,
    gs: &tauri_plugin_global_shortcut::GlobalShortcut<R>,
    display: &str,
) {
    let hotkey = hotkey_to_plugin(display);
    if hotkey.is_empty() {
        return;
    }
    let _ = gs.unregister(hotkey.as_str());
    match gs.on_shortcut(hotkey.as_str(), move |app, _, event| {
        if event.state != ShortcutState::Pressed {
            return;
        }
        focus_or_hide_main_window(&app);
    }) {
        Ok(()) => println!("全局热键（前台聚焦）已注册: {}", hotkey_to_display(&hotkey)),
        Err(e) => eprintln!("前台聚焦热键 {hotkey} 注册失败: {e}"),
    }
}

#[cfg(desktop)]
fn register_search_hotkey<R: Runtime>(
    _app: &AppHandle<R>,
    gs: &tauri_plugin_global_shortcut::GlobalShortcut<R>,
    display: &str,
) {
    let hotkey = hotkey_to_plugin(display);
    if hotkey.is_empty() {
        return;
    }
    let _ = gs.unregister(hotkey.as_str());
    match gs.on_shortcut(hotkey.as_str(), move |app, _, event| {
        if event.state != ShortcutState::Pressed {
            return;
        }
        show_main_window(&app);
        if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
            let _ = window.emit("mknote:open-search", ());
        }
    }) {
        Ok(()) => println!("全局热键（搜索）已注册: {}", hotkey_to_display(&hotkey)),
        Err(e) => eprintln!("搜索热键 {hotkey} 注册失败: {e}（仍可用 Ctrl+P）"),
    }
}

/// 用户设置热键：严格注册（无 fallback），全部成功后才应写入 config。
#[cfg(desktop)]
pub fn apply_user_global_hotkeys<R: Runtime>(
    app: &AppHandle<R>,
    hotkeys: &crate::GlobalHotkeys,
) -> Result<(), String> {
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();

    let toggle = hotkey_to_plugin(&hotkeys.toggle_window);
    if !toggle.is_empty() {
        try_register_toggle_shortcut(app, &gs, &toggle)?;
    }

    let focus = hotkey_to_plugin(&hotkeys.focus_window);
    if !focus.is_empty() {
        try_register_focus_shortcut(app, &gs, &focus)?;
    }

    let clipboard = hotkey_to_plugin(&hotkeys.clipboard_inbox);
    if !clipboard.is_empty() {
        try_register_clipboard_shortcut(app, &gs, &clipboard)?;
    }

    let search = hotkey_to_plugin(&hotkeys.quick_search);
    if !search.is_empty() {
        try_register_search_shortcut(app, &gs, &search)?;
    }

    Ok(())
}

#[cfg(desktop)]
fn try_register_toggle_shortcut<R: Runtime>(
    _app: &AppHandle<R>,
    gs: &tauri_plugin_global_shortcut::GlobalShortcut<R>,
    hotkey: &str,
) -> Result<(), String> {
    let _ = gs.unregister(hotkey);
    gs.on_shortcut(hotkey, move |app, _, event| {
        if event.state == ShortcutState::Pressed {
            toggle_main_window(app);
        }
    })
    .map_err(|e| format!("窗口切换热键 {} 注册失败: {e}", hotkey_to_display(hotkey)))?;
    println!("全局热键（窗口）已注册: {}", hotkey_to_display(hotkey));
    Ok(())
}

#[cfg(desktop)]
fn try_register_focus_shortcut<R: Runtime>(
    _app: &AppHandle<R>,
    gs: &tauri_plugin_global_shortcut::GlobalShortcut<R>,
    hotkey: &str,
) -> Result<(), String> {
    let _ = gs.unregister(hotkey);
    gs.on_shortcut(hotkey, move |app, _, event| {
        if event.state == ShortcutState::Pressed {
            focus_or_hide_main_window(app);
        }
    })
    .map_err(|e| format!("前台聚焦热键 {} 注册失败: {e}", hotkey_to_display(hotkey)))?;
    println!("全局热键（前台聚焦）已注册: {}", hotkey_to_display(hotkey));
    Ok(())
}

#[cfg(desktop)]
fn try_register_clipboard_shortcut<R: Runtime>(
    _app: &AppHandle<R>,
    gs: &tauri_plugin_global_shortcut::GlobalShortcut<R>,
    hotkey: &str,
) -> Result<(), String> {
    let _ = gs.unregister(hotkey);
    gs.on_shortcut(hotkey, move |app, _, event| {
        if event.state != ShortcutState::Pressed {
            return;
        }
        if !clipboard_hotkey_debounce_ok() {
            return;
        }
        show_main_window(&app);
        if let Err(e) = crate::capture::clipboard_inbox(&app) {
            eprintln!("剪贴板收集失败: {e}");
        }
    })
    .map_err(|e| format!("剪贴板热键 {} 注册失败: {e}", hotkey_to_display(hotkey)))?;
    println!("全局热键（剪贴板）已注册: {}", hotkey_to_display(hotkey));
    Ok(())
}

#[cfg(desktop)]
fn try_register_search_shortcut<R: Runtime>(
    _app: &AppHandle<R>,
    gs: &tauri_plugin_global_shortcut::GlobalShortcut<R>,
    hotkey: &str,
) -> Result<(), String> {
    let _ = gs.unregister(hotkey);
    gs.on_shortcut(hotkey, move |app, _, event| {
        if event.state != ShortcutState::Pressed {
            return;
        }
        show_main_window(&app);
        if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
            let _ = window.emit("mknote:open-search", ());
        }
    })
    .map_err(|e| format!("搜索热键 {} 注册失败: {e}", hotkey_to_display(hotkey)))?;
    println!("全局热键（搜索）已注册: {}", hotkey_to_display(hotkey));
    Ok(())
}

#[cfg(desktop)]
pub fn unregister_global_hotkey<R: Runtime>(app: &AppHandle<R>) {
    let _ = app.global_shortcut().unregister_all();
}

/// 隐藏/下次打开时统一回到紧凑默认界面，不把「展开管理台」写入会话。
pub fn persist_compact_layout() -> Result<AppConfig, String> {
    crate::update_config(|config| {
        config.layout_mode = "compact".to_string();
        Ok(())
    })
}

pub fn on_window_event<R: Runtime>(window: &WebviewWindow<R>, event: &tauri::WindowEvent) {
    match event {
        tauri::WindowEvent::CloseRequested { api, .. } => {
            api.prevent_close();
            let _ = hide_main_window(window.app_handle());
        }
        // 被动焦点回流只做屏幕内定位；托盘/热键/显式显示窗口才负责主动置前。
        tauri::WindowEvent::Focused(true) => {
            ensure_window_on_screen(window);
            #[cfg(windows)]
            {
                if should_promote_on_focus(
                    is_native_presented(window),
                    is_native_foreground(window),
                ) {
                    let Ok(config) = crate::load_config() else {
                        eprintln!("读取配置失败，跳过窗口置前");
                        return;
                    };
                    force_present_window(window, config.always_on_top);
                    let _ = window.set_always_on_top(config.always_on_top);
                    refresh_always_on_top_zorder(window, config.always_on_top);
                }
            }
        }
        _ => {}
    }
}

fn main_window<R: Runtime>(app: &AppHandle<R>) -> Option<WebviewWindow<R>> {
    app.get_webview_window(WINDOW_LABEL)
}

/// 托盘/热键切换时是否应隐藏：窗口在屏幕上可见则隐藏，否则显示。
/// 不要求前台焦点——失焦后按一次热键也应能直接隐藏。
fn should_hide_on_toggle<R: Runtime>(window: &WebviewWindow<R>) -> bool {
    is_window_presented(window)
}

#[cfg(windows)]
fn should_promote_on_focus(_native_presented: bool, _native_foreground: bool) -> bool {
    false
}

#[cfg(windows)]
fn refresh_always_on_top_zorder<R: Runtime>(window: &WebviewWindow<R>, enabled: bool) {
    if !enabled {
        return;
    }
    // Win+D 后置顶窗口 Z-order 可能错乱，短暂切换以强制抬到前台
    let _ = window.set_always_on_top(false);
    let _ = window.set_always_on_top(true);
}

pub fn save_window_geometry<R: Runtime>(window: &WebviewWindow<R>) -> Result<(), String> {
    let pos = window.outer_position().map_err(|e| e.to_string())?;
    // 用 inner 尺寸避免无边框窗口 outer/inner 换算累积误差导致每次略变大
    let size = window.inner_size().map_err(|e| e.to_string())?;
    let scale = window.scale_factor().map_err(|e| e.to_string())?;

    let geom = WindowGeometry {
        x: pos.x as f64 / scale,
        y: pos.y as f64 / scale,
        width: size.width as f64 / scale,
        height: size.height as f64 / scale,
    };

    if !is_valid_compact_geometry(&geom) {
        // logo 迷你模式（约 52×52）隐藏时不要覆盖正常窗口尺寸
        return Ok(());
    }
    crate::update_config(|config| {
        config.window = Some(geom.clone());
        config.compact_geometry = Some(geom);
        Ok(())
    })
    .map(|_| ())
}

fn restore_window_geometry<R: Runtime>(window: &WebviewWindow<R>, config: &AppConfig) {
    let geom = resolve_compact_geometry(config);
    let _ = window.set_size(tauri::LogicalSize::new(geom.width, geom.height));
    let _ = window.set_position(tauri::LogicalPosition::new(geom.x, geom.y));
}

pub fn set_always_on_top<R: Runtime>(
    app: &AppHandle<R>,
    enabled: bool,
) -> Result<AppConfig, String> {
    if let Some(window) = main_window(app) {
        window
            .set_always_on_top(enabled)
            .map_err(|e| e.to_string())?;
    }
    crate::update_config(|config| {
        config.always_on_top = enabled;
        Ok(())
    })
}

fn apply_layout_min_size<R: Runtime>(window: &WebviewWindow<R>, layout_mode: &str) {
    let (w, h) = if layout_mode == "expanded" {
        (720.0_f64, 420.0_f64)
    } else {
        (700.0_f64, 440.0_f64)
    };
    let _ = window.set_min_size(Some(tauri::LogicalSize::new(w, h)));
    let _ = window.set_resizable(true);
}

pub fn enter_expanded_layout<R: Runtime>(app: &AppHandle<R>) -> Result<AppConfig, String> {
    if let Some(window) = main_window(app) {
        apply_layout_min_size(&window, "expanded");
    }
    crate::update_config(|config| {
        config.layout_mode = "expanded".to_string();
        Ok(())
    })
}

pub fn leave_expanded_layout<R: Runtime>(app: &AppHandle<R>) -> Result<AppConfig, String> {
    if let Some(window) = main_window(app) {
        apply_layout_min_size(&window, "compact");
    }
    crate::update_config(|config| {
        config.layout_mode = "compact".to_string();
        Ok(())
    })
}

fn is_window_presented<R: Runtime>(window: &WebviewWindow<R>) -> bool {
    #[cfg(windows)]
    {
        return is_native_presented(window);
    }
    #[cfg(not(windows))]
    {
        window.is_visible().unwrap_or(false) && !window.is_minimized().unwrap_or(false)
    }
}

pub fn show_main_window<R: Runtime>(app: &AppHandle<R>) {
    let Some(window) = main_window(app) else {
        return;
    };
    let Ok(config) = persist_compact_layout() else {
        eprintln!("保存紧凑布局失败，跳过显示窗口");
        return;
    };
    apply_layout_min_size(&window, "compact");

    // 窗口已可见时勿恢复几何，避免剪贴板热键等操作把用户刚拖动的位置拉回旧坐标
    let needs_restore = !is_window_presented(&window);
    if needs_restore {
        restore_window_geometry(&window, &config);
        ensure_window_on_screen(&window);
    }

    let _ = window.emit("mknote:layout-compact", ());
    force_present_window(&window, config.always_on_top);
    let _ = window.set_always_on_top(config.always_on_top);
    #[cfg(windows)]
    refresh_always_on_top_zorder(&window, config.always_on_top);
    let _ = window.set_focus();
}

/// 前台聚焦热键：已在前台则隐藏到托盘，否则拉起并聚焦。
pub fn focus_or_hide_main_window<R: Runtime>(app: &AppHandle<R>) {
    let Some(window) = main_window(app) else {
        return;
    };
    if is_window_presented(&window) && is_window_in_foreground(&window) {
        hide_main_window(app);
    } else {
        show_main_window(app);
    }
}

fn is_window_in_foreground<R: Runtime>(window: &WebviewWindow<R>) -> bool {
    #[cfg(windows)]
    {
        return is_native_foreground(window);
    }
    #[cfg(not(windows))]
    {
        window.is_focused().unwrap_or(false)
    }
}

pub fn hide_main_window<R: Runtime>(app: &AppHandle<R>) {
    let Some(window) = main_window(app) else {
        return;
    };
    let Ok(config) = load_config() else {
        eprintln!("读取配置失败，跳过保存窗口位置");
        return;
    };
    if config.layout_mode == "compact" {
        let _ = save_window_geometry(&window);
    }
    let _ = persist_compact_layout();
    let _ = window.hide();
}

pub fn toggle_main_window<R: Runtime>(app: &AppHandle<R>) {
    let Some(window) = main_window(app) else {
        return;
    };
    if should_hide_on_toggle(&window) {
        hide_main_window(app);
    } else {
        show_main_window(app);
    }
}

fn apply_autostart<R: Runtime>(app: &AppHandle<R>, enabled: bool) -> Result<(), String> {
    if enabled {
        app.autolaunch().enable().map_err(|e| e.to_string())?;
    } else if app.autolaunch().is_enabled().unwrap_or(false) {
        // 未注册过自启时调用 disable 会在 Windows 上报 os error 2
        app.autolaunch().disable().map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn set_autostart_enabled<R: Runtime>(
    app: &AppHandle<R>,
    enabled: bool,
) -> Result<AppConfig, String> {
    apply_autostart(app, enabled)?;
    crate::update_config(|config| {
        config.autostart = enabled;
        Ok(())
    })
}

fn setup_tray<R: Runtime>(
    app: &AppHandle<R>,
    autostart: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    let show_i = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
    let hide_i = MenuItem::with_id(app, "hide", "隐藏窗口", true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let autostart_i =
        CheckMenuItem::with_id(app, "autostart", "开机自启", true, autostart, None::<&str>)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let quit_i = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[&show_i, &hide_i, &sep1, &autostart_i, &sep2, &quit_i],
    )?;

    let icon = load_tray_icon()?;

    let _tray = TrayIconBuilder::with_id("main-tray")
        .icon(icon)
        .tooltip("MKNOTE")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main_window(app),
            "hide" => hide_main_window(app),
            "autostart" => {
                if let Ok(config) = load_config() {
                    let _ = set_autostart_enabled(app, !config.autostart);
                } else {
                    eprintln!("读取配置失败，跳过切换开机自启");
                }
            }
            "quit" => {
                if let Some(window) = main_window(app) {
                    let _ = window.emit("mknote:request-quit", ());
                } else {
                    app.exit(0);
                }
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

fn load_tray_icon() -> Result<tauri::image::Image<'static>, Box<dyn std::error::Error>> {
    Ok(tauri::image::Image::from_bytes(include_bytes!(
        "../icons/32x32.png"
    ))?)
}

/// 全屏避让结束等后台状态变化使用：恢复可见性但不抢焦点、不抬高 z-order。
pub fn show_main_window_passive<R: Runtime>(app: &AppHandle<R>) {
    let Some(window) = main_window(app) else {
        return;
    };
    let Ok(config) = persist_compact_layout() else {
        eprintln!("保存紧凑布局失败，跳过被动显示窗口");
        return;
    };
    apply_layout_min_size(&window, "compact");
    if !is_window_presented(&window) {
        restore_window_geometry(&window, &config);
        ensure_window_on_screen(&window);
    }
    let _ = window.emit("mknote:layout-compact", ());
    show_window_no_activate(&window);
}

#[cfg(test)]
mod tests {
    #[cfg(windows)]
    use super::should_promote_on_focus;

    #[cfg(windows)]
    #[test]
    fn focused_event_does_not_promote_main_window_to_foreground() {
        assert!(!should_promote_on_focus(false, false));
        assert!(!should_promote_on_focus(true, false));
        assert!(!should_promote_on_focus(true, true));
    }
}
