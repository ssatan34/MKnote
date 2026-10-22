# Task: Stage A - Quick Todo window probe

Implement only Stage A from `docs/superpowers/specs/2026-07-11-quick-todo-window-design.md`.

## Binding scope

1. Fix the confirmed screenshot/fullscreen-dodge regression: when `fullscreen_watcher` restores MKnote after a fullscreen app or screenshot overlay ends, it must use a passive, non-activating path. It must not call the active path that uses `SetForegroundWindow`, `force_present_window`, `set_focus`, or topmost z-order promotion.
2. Add a minimal independent Quick Todo shell window. It contains only a title, an explicit pin toggle, and a close button. Do not connect Todo data or implement the full panel.
3. Opening is an explicit user action from the existing Quick Todo header entry. Reopening must reuse one window and explicitly focus it.
4. Closing the shell only hides it; application exit may destroy it. Hiding must save logical x/y/width/height.
5. Reopen restores saved logical geometry and clamps it to an available monitor. With no saved geometry, center it on the monitor containing the main window.
6. Default `always_on_top` is false. Pin changes are explicit and persistent.
7. The shell must not interfere with main, Capsule, Popout, tab-drag-preview window events.
8. Use DESIGN.md tokens and existing icon infrastructure. Keep changes minimal.
9. Follow TDD: add focused failing Rust tests for passive fullscreen restore decision and pure geometry/config behavior before implementation; add focused frontend tests where feasible for shell rendering/actions. Record RED and GREEN evidence.
10. Preserve all pre-existing dirty changes. Do not remove the generic `quick_capture_create` command. Do not implement Stage B or C.

## Verification

- focused Rust tests
- full `cargo test --manifest-path src-tauri/Cargo.toml` with writable temporary `CARGO_TARGET_DIR`
- `npm.cmd run test:quick-todo`
- `npm.cmd run build` (sandbox escalation may be required for esbuild)

## Stop boundary

Finish implementation and automated verification, then hand back for the Stage A Windows manual acceptance list. Do not proceed into Stage B.
