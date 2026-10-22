import { useEffect, useRef, useState } from "react";
import { resolveEffectiveThemeMode } from "../constants/themeAccents";
import { configService } from "../services/configService";
import { appBridge } from "../services/appBridge";
import { quickPocketWindow } from "../utils/quickPocketWindow";
import type { AppConfig, QuickPocketWindowState, ThemeMode } from "../types";
import { useQuickPocketController } from "../hooks/useQuickPocketController";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WindowPinButton } from "./WindowPinButton";
import { LockToggleButton } from "./LockToggleButton";
import { QuickPocketPanel, type QuickPocketPanelHandle } from "./QuickPocketPanel";
import { DEFAULT_QUICK_POCKET_ID } from "../utils/quickPocketRegistry";
import "./QuickPocketShell.css";

function applyTheme(config: AppConfig) {
    const mode = (config.theme_mode ?? "system") as ThemeMode;
  document.documentElement.setAttribute("data-theme-mode", mode);
  document.documentElement.setAttribute("data-theme", resolveEffectiveThemeMode(mode));
  document.documentElement.setAttribute("data-light-theme", config.light_theme ?? "mknote");
  document.documentElement.setAttribute("data-dark-theme", config.dark_theme ?? "mknote");
  document.documentElement.setAttribute("data-accent-skin", config.accent_skin ?? "mknote");
}

function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }

export function QuickPocketShell() {
  const pocketId = getCurrentWindow().label.replace(/^quick-pocket-/, "");
  const [pinned, setPinned] = useState(false);
  const [locked, setLocked] = useState(false);
  const [windowError, setWindowError] = useState<string | null>(null);
  const [pocketName, setPocketName] = useState("Quick Pocket");
  const controller = useQuickPocketController(pocketId);
  const panelRef = useRef<QuickPocketPanelHandle>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([configService.getConfig(), appBridge.invoke<QuickPocketWindowState>("get_quick_pocket_window_state", { pocketId })]).then(([config, state]) => { if (active) { applyTheme(config); setPinned(state.alwaysOnTop); setLocked(state.locked); setPocketName(pocketId === DEFAULT_QUICK_POCKET_ID ? "Quick Pocket" : config.quick_pockets?.find((pocket) => pocket.id === pocketId)?.name ?? pocketId); } }).catch((error) => { if (active) setWindowError(`读取 Quick Pocket 窗口配置失败：${errorMessage(error)}`); });
    return () => { active = false; };
  }, []);

  const togglePinned = async () => { const next = !pinned; try { await quickPocketWindow.setPinned(pocketId, next); setPinned(next); setWindowError(null); } catch (error) { setWindowError(`设置 Quick Pocket 置顶失败：${errorMessage(error)}`); } };
  const toggleLocked = async () => { const next = !locked; try { await quickPocketWindow.setLocked(pocketId, next); setLocked(next); setWindowError(null); } catch (error) { setWindowError(`设置 Quick Pocket 窗口锁定失败：${errorMessage(error)}`); } };
  const hide = () => { void quickPocketWindow.hide(pocketId).catch((error) => setWindowError(`关闭 Quick Pocket 失败：${errorMessage(error)}`)); };

  const close = async () => { await panelRef.current?.flushEditing(); hide(); };
  const startWindowDrag = () => {
    void appBridge.window.startDragging().catch((error) => {
      setWindowError(`拖动 Quick Pocket 窗口失败：${errorMessage(error)}`);
    });
  };
  return <main className="quick-pocket-shell" aria-label={`${pocketName} window`}><QuickPocketPanel ref={panelRef} pocketName={pocketName} items={controller.items} groups={controller.groups} loading={controller.loading} error={windowError ?? controller.error} onAdd={async (title, body, tag, groupId) => { await controller.add(title, body, tag, groupId); }} onUpdate={async (id, title, body, tag) => { await controller.update(id, title, body, tag); }} onDelete={async (id) => { await controller.remove(id); }} onReorder={async (ids) => { await controller.reorder(ids); }} onCreateGroup={async (ids, name) => { await controller.createGroup(ids, name); }} onRenameGroup={async (id, name) => { await controller.renameGroup(id, name); }} onDissolveGroup={async (id) => { await controller.dissolveGroup(id); }} onMoveItem={async (id, groupId, ids) => { await controller.moveItem(id, groupId, ids); }} onClose={() => void close()} onWindowDragStart={startWindowDrag} windowDragRegion={!locked} headerActions={<><WindowPinButton className="quick-pocket-shell-button" pinned={pinned} onClick={() => void togglePinned()} /><LockToggleButton className="quick-pocket-shell-button" locked={locked} title={locked ? "解除窗口锁定" : "锁定窗口"} onClick={() => void toggleLocked()} /></>} /></main>;
}
