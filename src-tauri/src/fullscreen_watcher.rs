//! 全屏避让：检测前台窗口是否占满整块显示器，并在状态变化时自动隐藏/恢复 MKnote。
//!
//! 仅 Windows 平台启用。后台线程每 2 秒轮询一次，开销可忽略。

#[cfg(windows)]
mod imp {
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;
    use tauri::{AppHandle, Manager, Runtime};

    use windows::core::PWSTR;
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::Foundation::HWND;
    use windows::Win32::Graphics::Gdi::{
        GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
    };
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_FORMAT,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetClassNameW, GetForegroundWindow, GetWindowRect, GetWindowThreadProcessId,
    };

    /// 全局：当前是否因全屏避让而被隐藏（区分用户主动隐藏）
    static HIDDEN_BY_DODGE: AtomicBool = AtomicBool::new(false);

    #[derive(Clone, Copy, Debug, PartialEq, Eq)]
    enum FullscreenRestoreAction {
        PassiveShow,
    }

    #[derive(Clone, Copy, Debug, PartialEq, Eq)]
    enum ForegroundFullscreenState {
        Normal,
        Fullscreen,
        CaptureOverlay,
    }

    fn fullscreen_restore_action(hidden_by_dodge: bool) -> Option<FullscreenRestoreAction> {
        hidden_by_dodge.then_some(FullscreenRestoreAction::PassiveShow)
    }

    /// 获取当前 main 窗口的 HWND（用于排除自身）
    fn main_hwnd<R: Runtime>(app: &AppHandle<R>) -> Option<isize> {
        app.get_webview_window(crate::system::WINDOW_LABEL)
            .and_then(|w| w.hwnd().ok())
            .map(|h: windows::Win32::Foundation::HWND| h.0 as isize)
    }

    fn window_class_name(hwnd: HWND) -> Option<String> {
        let mut buffer = [0u16; 128];
        let len = unsafe { GetClassNameW(hwnd, &mut buffer) };
        if len == 0 {
            return None;
        }
        Some(String::from_utf16_lossy(&buffer[..len as usize]))
    }

    fn is_shell_window_class(class_name: &str) -> bool {
        matches!(
            class_name,
            "Progman" | "WorkerW" | "Shell_TrayWnd" | "Shell_SecondaryTrayWnd"
        )
    }

    fn is_screen_capture_process(process_name: &str) -> bool {
        matches!(
            process_name.to_ascii_lowercase().as_str(),
            "snipaste.exe" | "snippingtool.exe" | "screenclippinghost.exe"
        )
    }

    fn window_process_name(hwnd: HWND) -> Option<String> {
        let mut pid = 0;
        unsafe {
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
        }
        if pid == 0 {
            return None;
        }
        let process = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()? };
        let mut buffer = [0u16; 1024];
        let mut len = buffer.len() as u32;
        let result = unsafe {
            QueryFullProcessImageNameW(
                process,
                PROCESS_NAME_FORMAT(0),
                PWSTR(buffer.as_mut_ptr()),
                &mut len,
            )
        };
        unsafe {
            let _ = CloseHandle(process);
        }
        result.ok()?;
        std::path::Path::new(&String::from_utf16_lossy(&buffer[..len as usize]))
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
    }

    /// 检测前台窗口是否真正占满其所在显示器（排除 MKnote 自身）。
    fn foreground_fullscreen_state<R: Runtime>(app: &AppHandle<R>) -> ForegroundFullscreenState {
        let self_hwnd = main_hwnd(app);
        unsafe {
            let fg: HWND = GetForegroundWindow();
            if fg.0.is_null() {
                return ForegroundFullscreenState::Normal;
            }
            // 排除 MKnote 自身窗口
            if let Some(sh) = self_hwnd {
                if fg.0 as isize == sh {
                    return ForegroundFullscreenState::Normal;
                }
            }
            if window_class_name(fg)
                .as_deref()
                .is_some_and(is_shell_window_class)
            {
                return ForegroundFullscreenState::Normal;
            }
            if window_process_name(fg)
                .as_deref()
                .is_some_and(is_screen_capture_process)
            {
                return ForegroundFullscreenState::CaptureOverlay;
            }

            let mut rect = std::mem::zeroed();
            if GetWindowRect(fg, &mut rect).is_err() {
                return ForegroundFullscreenState::Normal;
            }

            let monitor = MonitorFromWindow(fg, MONITOR_DEFAULTTONEAREST);
            let mut info = MONITORINFO {
                cbSize: std::mem::size_of::<MONITORINFO>() as u32,
                ..std::mem::zeroed()
            };
            if !GetMonitorInfoW(monitor, &mut info).as_bool() {
                return ForegroundFullscreenState::Normal;
            }

            // 判断窗口矩形是否完整覆盖显示器物理区域
            if rect.left <= info.rcMonitor.left
                && rect.top <= info.rcMonitor.top
                && rect.right >= info.rcMonitor.right
                && rect.bottom >= info.rcMonitor.bottom
            {
                ForegroundFullscreenState::Fullscreen
            } else {
                ForegroundFullscreenState::Normal
            }
        }
    }

    /// 启动后台轮询线程（仅在 fullscreen_dodge 开启时调用）。
    pub fn spawn_fullscreen_watcher<R: Runtime + 'static>(
        app: AppHandle<R>,
        running: Arc<AtomicBool>,
    ) {
        std::thread::spawn(move || {
            let mut was_fullscreen = false;
            loop {
                // 外部可通过 running 标志停止本线程
                if !running.load(Ordering::Relaxed) {
                    break;
                }

                // 如果功能被用户关闭，进入 idle 等待后再检查
                let dodge_enabled = crate::load_config()
                    .map(|c| c.fullscreen_dodge)
                    .unwrap_or(false);
                if !dodge_enabled {
                    std::thread::sleep(std::time::Duration::from_secs(2));
                    continue;
                }

                let state = foreground_fullscreen_state(&app);
                if state == ForegroundFullscreenState::CaptureOverlay {
                    std::thread::sleep(std::time::Duration::from_secs(2));
                    continue;
                }
                let now_fullscreen = state == ForegroundFullscreenState::Fullscreen;

                if now_fullscreen && !was_fullscreen {
                    // 前台窗口刚进入全屏：隐藏 MKnote
                    let window_visible = app
                        .get_webview_window(crate::system::WINDOW_LABEL)
                        .map(|w| w.is_visible().unwrap_or(false))
                        .unwrap_or(false);
                    if window_visible {
                        HIDDEN_BY_DODGE.store(true, Ordering::Relaxed);
                        crate::system::hide_main_window(&app);
                    }
                } else if !now_fullscreen && was_fullscreen {
                    // 全屏结束：仅在「因避让而隐藏」时才自动恢复
                    let hidden_by_dodge = HIDDEN_BY_DODGE.swap(false, Ordering::Relaxed);
                    if fullscreen_restore_action(hidden_by_dodge)
                        == Some(FullscreenRestoreAction::PassiveShow)
                    {
                        crate::system::show_main_window_passive(&app);
                    }
                }

                was_fullscreen = now_fullscreen;
                std::thread::sleep(std::time::Duration::from_secs(2));
            }
        });
    }

    #[cfg(test)]
    mod tests {
        use super::{
            fullscreen_restore_action, is_screen_capture_process, is_shell_window_class,
            FullscreenRestoreAction,
        };

        #[test]
        fn screenshot_overlays_do_not_count_as_fullscreen_apps() {
            assert!(is_screen_capture_process("Snipaste.exe"));
            assert!(is_screen_capture_process("SnippingTool.exe"));
            assert!(is_screen_capture_process("ScreenClippingHost.exe"));
            assert!(!is_screen_capture_process("chrome.exe"));
        }

        #[test]
        fn shell_windows_do_not_count_as_fullscreen_apps() {
            assert!(is_shell_window_class("Progman"));
            assert!(is_shell_window_class("WorkerW"));
            assert!(is_shell_window_class("Shell_TrayWnd"));
            assert!(!is_shell_window_class("Chrome_WidgetWin_1"));
            assert!(!is_shell_window_class("ApplicationFrameWindow"));
        }

        #[test]
        fn fullscreen_dodge_restore_uses_passive_non_activating_show() {
            assert_eq!(
                fullscreen_restore_action(true),
                Some(FullscreenRestoreAction::PassiveShow)
            );
            assert_eq!(fullscreen_restore_action(false), None);
        }
    }
}

#[cfg(windows)]
pub use imp::spawn_fullscreen_watcher;

/// 非 Windows 平台的空实现
#[cfg(not(windows))]
pub fn spawn_fullscreen_watcher<R: tauri::Runtime + 'static>(
    _app: tauri::AppHandle<R>,
    _running: std::sync::Arc<std::sync::atomic::AtomicBool>,
) {
}
