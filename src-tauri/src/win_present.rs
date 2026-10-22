//! Windows 窗口呈现状态与强制恢复（修复 Win+D「显示桌面」后 Tauri 状态不同步）

use tauri::{Runtime, WebviewWindow};

#[cfg(windows)]
use windows::Win32::Foundation::HWND;
#[cfg(windows)]
use windows::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
#[cfg(windows)]
use windows::Win32::UI::Input::KeyboardAndMouse::{
    MapVirtualKeyW, SendInput, INPUT, INPUT_KEYBOARD, KEYEVENTF_EXTENDEDKEY, KEYEVENTF_KEYUP,
    MAPVK_VK_TO_VSC, VIRTUAL_KEY, VK_LMENU, VK_MENU,
};
#[cfg(windows)]
use windows::Win32::UI::WindowsAndMessaging::{
    BringWindowToTop, GetAncestor, GetForegroundWindow, GetWindowPlacement,
    GetWindowThreadProcessId, IsIconic, IsWindowVisible, SetForegroundWindow, SetWindowPos,
    ShowWindow, GA_ROOT, HWND_TOPMOST, SWP_NOMOVE, SWP_NOSIZE, SWP_SHOWWINDOW, SW_HIDE,
    SW_MINIMIZE, SW_RESTORE, SW_SHOW, SW_SHOWMINIMIZED, SW_SHOWNOACTIVATE, SW_SHOWNORMAL,
    WINDOWPLACEMENT,
};

/// 窗口中心是否落在某块显示器工作区内。
pub fn ensure_window_on_screen<R: Runtime>(window: &WebviewWindow<R>) {
    let Ok(pos) = window.outer_position() else {
        return;
    };
    let Ok(size) = window.outer_size() else {
        return;
    };
    let cx = pos.x + size.width as i32 / 2;
    let cy = pos.y + size.height as i32 / 2;

    let monitors = window.available_monitors().unwrap_or_default();
    if monitors.is_empty() {
        return;
    }

    let center_on_monitor = monitors.iter().any(|m| {
        let mp = m.position();
        let ms = m.size();
        cx >= mp.x && cx < mp.x + ms.width as i32 && cy >= mp.y && cy < mp.y + ms.height as i32
    });

    if center_on_monitor {
        return;
    }

    let monitor = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten());
    let Some(monitor) = monitor else {
        return;
    };

    let scale = window.scale_factor().unwrap_or(1.0);
    let mp = monitor.position();
    let ms = monitor.size();
    let ww = size.width as f64 / scale;
    let wh = size.height as f64 / scale;
    let mx = mp.x as f64 / scale;
    let my = mp.y as f64 / scale;
    let mw = ms.width as f64 / scale;
    let mh = ms.height as f64 / scale;
    let x = mx + (mw - ww).max(0.0) / 2.0;
    let y = my + (mh - wh).max(0.0) / 2.0;
    let _ = window.set_position(tauri::LogicalPosition::new(x, y));
}

/// 窗口是否真正在屏幕上（基于 Win32，而非仅 Tauri 抽象层）。
#[cfg(windows)]
pub fn is_native_presented<R: Runtime>(window: &WebviewWindow<R>) -> bool {
    let Ok(hwnd) = window.hwnd() else {
        return window.is_visible().unwrap_or(false) && !window.is_minimized().unwrap_or(false);
    };
    let hwnd = root_window(hwnd);
    unsafe {
        if !IsWindowVisible(hwnd).as_bool() {
            return false;
        }
        if IsIconic(hwnd).as_bool() {
            return false;
        }
        let mut placement = WINDOWPLACEMENT {
            length: std::mem::size_of::<WINDOWPLACEMENT>() as u32,
            ..Default::default()
        };
        if GetWindowPlacement(hwnd, &mut placement).is_ok() {
            let cmd = placement.showCmd;
            if cmd == SW_HIDE.0 as u32
                || cmd == SW_MINIMIZE.0 as u32
                || cmd == SW_SHOWMINIMIZED.0 as u32
            {
                return false;
            }
        }
        true
    }
}

/// Tauri 的 WebviewWindow 句柄在部分 WebView2 窗口上是子句柄；Win32 呈现和前台
/// API 需要对应的顶层窗口句柄。
#[cfg(windows)]
fn root_window(hwnd: HWND) -> HWND {
    unsafe {
        let root = GetAncestor(hwnd, GA_ROOT);
        if root.0.is_null() {
            hwnd
        } else {
            root
        }
    }
}

#[cfg(not(windows))]
pub fn is_native_presented<R: Runtime>(window: &WebviewWindow<R>) -> bool {
    window.is_visible().unwrap_or(false) && !window.is_minimized().unwrap_or(false)
}

/// 当前窗口是否为前台窗口。
#[cfg(windows)]
pub fn is_native_foreground<R: Runtime>(window: &WebviewWindow<R>) -> bool {
    let Ok(hwnd) = window.hwnd() else {
        return window.is_focused().unwrap_or(false);
    };
    unsafe {
        // WebviewWindow 可能提供 WebView 子窗口句柄，而系统前台 API 返回顶层窗口句柄。
        // 同时比较根窗口，避免焦点已切入 Quick 窗口却被误判为未前台。
        GetForegroundWindow() == root_window(hwnd)
    }
}

#[cfg(not(windows))]
pub fn is_native_foreground<R: Runtime>(window: &WebviewWindow<R>) -> bool {
    window.is_focused().unwrap_or(false)
}

#[cfg(windows)]
unsafe fn force_foreground(hwnd: HWND) {
    if GetForegroundWindow() == hwnd {
        return;
    }

    let foreground = GetForegroundWindow();
    let mut fg_pid = Default::default();
    let fg_thread = if foreground.0.is_null() {
        0
    } else {
        GetWindowThreadProcessId(foreground, Some(&mut fg_pid))
    };
    let cur_thread = GetCurrentThreadId();

    if fg_thread != 0 && fg_thread != cur_thread {
        let _ = AttachThreadInput(cur_thread, fg_thread, true);
    }

    if !SetForegroundWindow(hwnd).as_bool() {
        let alt_sc = MapVirtualKeyW(u32::from(VK_MENU.0), MAPVK_VK_TO_VSC);
        let mut inputs: [INPUT; 2] = std::mem::zeroed();
        inputs[0].r#type = INPUT_KEYBOARD;
        inputs[0].Anonymous.ki.wVk = VIRTUAL_KEY(VK_LMENU.0 as u16);
        inputs[0].Anonymous.ki.wScan = alt_sc as u16;
        inputs[0].Anonymous.ki.dwFlags = KEYEVENTF_EXTENDEDKEY;
        inputs[1].r#type = INPUT_KEYBOARD;
        inputs[1].Anonymous.ki.wVk = VIRTUAL_KEY(VK_LMENU.0 as u16);
        inputs[1].Anonymous.ki.wScan = alt_sc as u16;
        inputs[1].Anonymous.ki.dwFlags = KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP;
        let _ = SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
        let _ = SetForegroundWindow(hwnd);
    }

    if fg_thread != 0 && fg_thread != cur_thread {
        let _ = AttachThreadInput(cur_thread, fg_thread, false);
    }
}

#[cfg(windows)]
unsafe fn apply_topmost(hwnd: HWND) {
    let _ = SetWindowPos(
        hwnd,
        Some(HWND_TOPMOST),
        0,
        0,
        0,
        0,
        SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW,
    );
}

/// 用 Win32 API 强制恢复并同步 Tauri 层状态。
#[cfg(windows)]
pub fn force_present_window<R: Runtime>(window: &WebviewWindow<R>, always_on_top: bool) {
    if let Ok(hwnd) = window.hwnd() {
        let hwnd = root_window(hwnd);
        unsafe {
            if !IsWindowVisible(hwnd).as_bool() || IsIconic(hwnd).as_bool() {
                let _ = ShowWindow(hwnd, SW_RESTORE);
            }
            let _ = ShowWindow(hwnd, SW_SHOWNORMAL);
            let _ = ShowWindow(hwnd, SW_SHOW);
            if always_on_top {
                apply_topmost(hwnd);
            }
            let _ = BringWindowToTop(hwnd);
            force_foreground(hwnd);
        }
    }
    let _ = window.unminimize();
    let _ = window.show();
}

/// 被动恢复窗口，不改变前台窗口，不修改 topmost z-order。
#[cfg(windows)]
pub fn show_window_no_activate<R: Runtime>(window: &WebviewWindow<R>) {
    if let Ok(hwnd) = window.hwnd() {
        let hwnd = root_window(hwnd);
        unsafe {
            let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);
        }
    }
}

#[cfg(not(windows))]
pub fn show_window_no_activate<R: Runtime>(window: &WebviewWindow<R>) {
    let _ = window.show();
}

#[cfg(not(windows))]
pub fn force_present_window<R: Runtime>(window: &WebviewWindow<R>, _always_on_top: bool) {
    let _ = window.unminimize();
    let _ = window.show();
}
