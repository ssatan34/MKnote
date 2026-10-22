import { appBridge } from "../services/appBridge";

export const quickPocketWindow = {
  open: (pocketId: string) => appBridge.invoke("open_quick_pocket_window", { pocketId }),
  hide: (pocketId: string) => appBridge.invoke("hide_quick_pocket_window", { pocketId }),
  toggle: (pocketId: string) => appBridge.invoke("toggle_quick_pocket_window", { pocketId }),
  setPinned: (pocketId: string, enabled: boolean) => appBridge.invoke("set_quick_pocket_always_on_top", { pocketId, enabled }),
  setLocked: (pocketId: string, enabled: boolean) => appBridge.invoke("set_quick_pocket_locked", { pocketId, enabled }),
};
