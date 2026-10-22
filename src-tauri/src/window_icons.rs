//! Load Windows icons at their native DPI size instead of Tauri's first ICO frame.

use std::sync::{Arc, Mutex};
use tauri::{plugin::TauriPlugin, Runtime, WindowEvent};
use windows::{
    core::PCWSTR,
    Win32::{
        Foundation::{HINSTANCE, HWND, LPARAM, WPARAM},
        System::LibraryLoader::GetModuleHandleW,
        UI::{
            HiDpi::{GetDpiForWindow, GetSystemMetricsForDpi},
            WindowsAndMessaging::{
                DestroyIcon, LoadImageW, SendMessageW, HICON, ICON_BIG, ICON_SMALL, IMAGE_ICON,
                LR_DEFAULTCOLOR, SM_CXICON, SM_CXSMICON, WM_SETICON,
            },
        },
    },
};

// tauri-build embeds bundle.icon's ICO in the executable under this resource ID.
const APP_ICON_RESOURCE: PCWSTR = PCWSTR(32512usize as *const u16);

// Store handles as integers so the event listener can be Send + Sync. These owned
// icons remain alive until replacement or native window destruction.
struct OwnedIcon(usize);

impl OwnedIcon {
    fn load(size: i32) -> windows::core::Result<Self> {
        unsafe {
            let module = GetModuleHandleW(None)?;
            let icon = LoadImageW(
                Some(HINSTANCE(module.0)),
                APP_ICON_RESOURCE,
                IMAGE_ICON,
                size,
                size,
                LR_DEFAULTCOLOR,
            )?;
            Ok(Self(icon.0 as usize))
        }
    }
}

impl Drop for OwnedIcon {
    fn drop(&mut self) {
        // Never destroy the previous WM_SETICON result: it belongs to Tao.
        if let Err(error) = unsafe { DestroyIcon(HICON(self.0 as *mut _)) } {
            eprintln!("Failed to release window icon: {error}");
        }
    }
}

struct WindowIcons {
    small: OwnedIcon,
    big: OwnedIcon,
}

impl WindowIcons {
    fn load(dpi: u32) -> windows::core::Result<Self> {
        let small_size = unsafe { GetSystemMetricsForDpi(SM_CXSMICON, dpi) };
        let big_size = unsafe { GetSystemMetricsForDpi(SM_CXICON, dpi) };
        Ok(Self {
            small: OwnedIcon::load(small_size)?,
            big: OwnedIcon::load(big_size)?,
        })
    }

    fn apply(&self, hwnd: HWND) {
        unsafe {
            SendMessageW(
                hwnd,
                WM_SETICON,
                Some(WPARAM(ICON_SMALL as usize)),
                Some(LPARAM(self.small.0 as isize)),
            );
            SendMessageW(
                hwnd,
                WM_SETICON,
                Some(WPARAM(ICON_BIG as usize)),
                Some(LPARAM(self.big.0 as isize)),
            );
        }
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    tauri::plugin::Builder::new("window-icons")
        .on_window_ready(|window| {
            let hwnd = match window.hwnd() {
                Ok(hwnd) => hwnd,
                Err(error) => {
                    eprintln!("Failed to get window handle for icons: {error}");
                    return;
                }
            };
            let icons = match WindowIcons::load(unsafe { GetDpiForWindow(hwnd) }) {
                Ok(icons) => icons,
                Err(error) => {
                    eprintln!("Failed to load DPI-specific window icons: {error}");
                    return;
                }
            };
            icons.apply(hwnd);
            let icons = Arc::new(Mutex::new(Some(icons)));
            let hwnd = hwnd.0 as usize;
            window.on_window_event(move |event| match event {
                WindowEvent::ScaleFactorChanged { scale_factor, .. } => {
                    let dpi = (scale_factor * 96.0).round() as u32;
                    match WindowIcons::load(dpi) {
                        Ok(next) => {
                            let mut current = icons.lock().expect("window icon lock poisoned");
                            next.apply(HWND(hwnd as *mut _));
                            *current = Some(next);
                        }
                        Err(error) => eprintln!("Failed to update window icons for DPI: {error}"),
                    }
                }
                WindowEvent::Destroyed => {
                    icons.lock().expect("window icon lock poisoned").take();
                }
                _ => {}
            });
        })
        .build()
}
