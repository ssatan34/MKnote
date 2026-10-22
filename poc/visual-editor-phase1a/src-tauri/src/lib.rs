#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/// 启动只承载 Phase 1A 静态页面的 Tauri 外壳。
///
/// 这里不注册生产命令、不读取磁盘笔记，也不接入 MKnote 保存队列；
/// WebView2 只用于验证真实桌面环境中的编辑手感。
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Phase 1A WebView2 harness");
}
