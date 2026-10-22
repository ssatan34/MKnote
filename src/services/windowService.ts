import { appBridge } from "./appBridge";
import { createQuickTodoWindowActions } from "../utils/quickTodoWindow";

const quickTodoWindowActions = createQuickTodoWindowActions((command, args) =>
  appBridge.invoke(command, args),
);

export const windowService = {
  openQuickTodo: quickTodoWindowActions.open,
  openQuickTodoReminder: quickTodoWindowActions.openReminder,
  hideQuickTodoReminder: quickTodoWindowActions.hideReminder,
  hideQuickTodo: quickTodoWindowActions.hide,
  setQuickTodoPinned: quickTodoWindowActions.setPinned,
  setQuickTodoLocked: quickTodoWindowActions.setLocked,

  exitApp() {
    return appBridge.invoke("exit_app");
  },

  openCapsule(args: Record<string, unknown>) {
    return appBridge.invoke("open_capsule", args);
  },

  takeCapsuleInit<T>(label: string) {
    return appBridge.invoke<T | null>("take_capsule_init", { label });
  },

  closeCapsule(zone: string, name: string) {
    return appBridge.invoke("close_capsule", { zone, name });
  },

  closeCapsuleByLabel(zone: string, name: string, label: string) {
    return appBridge.invoke("close_capsule", { zone, name, label });
  },

  restoreCapsuleToPopout(args: Record<string, unknown>) {
    return appBridge.invoke("restore_capsule_to_popout", args);
  },

  restorePopoutToCapsule(args: Record<string, unknown>) {
    return appBridge.invoke("restore_popout_to_capsule", args);
  },

  collapseNoteWindowToCapsule(args: Record<string, unknown>) {
    return appBridge.invoke("collapse_note_window_to_capsule", args);
  },

  expandNoteWindowFromCapsule(args: Record<string, unknown>) {
    return appBridge.invoke("expand_note_window_from_capsule", args);
  },

  ackUnifiedNoteWindowModeReady(args: Record<string, unknown>) {
    return appBridge.invoke("ack_unified_note_window_mode_ready", args);
  },

  settleUnifiedNoteCapsulePosition(args: Record<string, unknown>) {
    return appBridge.invoke("settle_unified_note_capsule_position", args);
  },

  settleCapsulePosition(args: Record<string, unknown>) {
    return appBridge.invoke<string | null>("settle_capsule_position", args);
  },

  beginCapsuleDrag(args: Record<string, unknown>) {
    return appBridge.invoke("begin_capsule_drag", args);
  },

  settlePopoutGeometry(args: Record<string, unknown>) {
    return appBridge.invoke("settle_popout_geometry", args);
  },

  setCapsuleAlwaysOnTop(args: Record<string, unknown>) {
    return appBridge.invoke("set_capsule_always_on_top", args);
  },

  setPopoutAlwaysOnTop(args: Record<string, unknown>) {
    return appBridge.invoke("set_popout_always_on_top", args);
  },

  hideCapsuleSnap(args: Record<string, unknown>) {
    return appBridge.invoke("hide_capsule_snap", args);
  },

  showCapsuleSnap(args: Record<string, unknown>) {
    return appBridge.invoke("show_capsule_snap", args);
  },

  notifyPoppedOutRenamed(args: Record<string, unknown>) {
    return appBridge.invoke("notify_popped_out_renamed", args);
  },

  showTabDragPreview(args: Record<string, unknown>) {
    return appBridge.invoke("show_tab_drag_preview", args);
  },

  hideTabDragPreview() {
    return appBridge.invoke("hide_tab_drag_preview");
  },

  openNotePopout(args: Record<string, unknown>) {
    return appBridge.invoke("open_note_popout", args);
  },

  takePopoutInit<T>(label: string) {
    return appBridge.invoke<T | null>("take_popout_init", { label });
  },

  closeNotePopout(zone: string, name: string) {
    return appBridge.invoke("close_note_popout", { zone, name });
  },

  deleteNotePopout(zone: string, name: string) {
    return appBridge.invoke("delete_note_popout", { zone, name });
  },

  completeCapsuleNote(args: Record<string, unknown>) {
    return appBridge.invoke("complete_capsule_note", args);
  },

  openFolder(path: string) {
    return appBridge.invoke("open_folder", { path });
  },
};
