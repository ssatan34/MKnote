import { useEffect, useRef, useState } from "react";
import { useQuickPocketController } from "../hooks/useQuickPocketController";
import { quickPocketService } from "../services/quickPocketService";
import { quickPocketWindow } from "../utils/quickPocketWindow";
import { DEFAULT_QUICK_POCKET_ID, type QuickPocketDefinition } from "../utils/quickPocketRegistry";
import { Icon } from "./Icon";
import { QuickPocketPanel, type QuickPocketPanelHandle } from "./QuickPocketPanel";
import { QuickPocketPicker } from "./QuickPocketPicker";
import "./QuickPocketEntry.css";

function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }

export function QuickPocketEntry() {
  const entryRef = useRef<HTMLDivElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pockets, setPockets] = useState<QuickPocketDefinition[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [fallbackPocketId, setFallbackPocketId] = useState<string | null>(null);
  const [fallbackPocketName, setFallbackPocketName] = useState<string | null>(null);
  const [fallbackError, setFallbackError] = useState<string | null>(null);
  const controller = useQuickPocketController(fallbackPocketId ?? DEFAULT_QUICK_POCKET_ID);
  const panelRef = useRef<QuickPocketPanelHandle>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    let active = true;
    setPickerLoading(true);
    void quickPocketService.listPockets().then((next) => { if (active) { setPockets(next); setPickerError(null); } }).catch((error) => { if (active) setPickerError(`读取 Pocket 列表失败：${errorMessage(error)}`); }).finally(() => { if (active) setPickerLoading(false); });
    return () => { active = false; };
  }, [pickerOpen]);

  useEffect(() => {
    if (!pickerOpen && !fallbackPocketId) return;
    const dismissIfOutside = (target: EventTarget | null) => {
      if (target instanceof Node && entryRef.current?.contains(target)) return;
      void Promise.resolve(panelRef.current?.flushEditing()).finally(() => { setPickerOpen(false); setFallbackPocketId(null); setFallbackPocketName(null); });
    };
    const onPointerDown = (event: PointerEvent) => dismissIfOutside(event.target);
    const onFocusIn = (event: FocusEvent) => dismissIfOutside(event.target);
    const onWindowBlur = () => dismissIfOutside(null);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("focusin", onFocusIn, true);
    window.addEventListener("blur", onWindowBlur);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("focusin", onFocusIn, true);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, [pickerOpen, fallbackPocketId]);

  const openWindow = async (pocket: QuickPocketDefinition) => {
    try { await quickPocketWindow.open(pocket.id); setPickerOpen(false); setFallbackPocketId(null); setFallbackError(null); }
    catch (error) { setFallbackError(`打开 ${pocket.name} 独立窗口失败：${errorMessage(error)}；已回退到程序内面板。`); setFallbackPocketId(pocket.id); setFallbackPocketName(pocket.name); setPickerOpen(false); }
  };
  const close = async () => { await panelRef.current?.flushEditing(); setFallbackPocketId(null); setFallbackPocketName(null); setPickerOpen(false); };
  return <div ref={entryRef} className="quick-pocket-entry"><button type="button" className="icon-btn quick-pocket-trigger" title="打开 Quick Pocket" aria-label="打开 Quick Pocket" onClick={() => { if (fallbackPocketId) void close(); else setPickerOpen((open) => !open); }}><Icon name="pills" size={16} className="quick-pocket-icon" /></button>
    {pickerOpen && <QuickPocketPicker pockets={pockets} loading={pickerLoading} error={pickerError} onOpen={(pocket) => void openWindow(pocket)} />}
    {fallbackPocketId && <div className="quick-pocket-popover" data-no-drag><QuickPocketPanel ref={panelRef} pocketName={fallbackPocketName ?? "Quick Pocket"} items={controller.items} groups={controller.groups} loading={controller.loading} error={fallbackError ?? controller.error} onAdd={async (title, body, tag, groupId) => { await controller.add(title, body, tag, groupId); }} onUpdate={async (id, title, body, tag) => { await controller.update(id, title, body, tag); }} onDelete={async (id) => { await controller.remove(id); }} onReorder={async (ids) => { await controller.reorder(ids); }} onCreateGroup={async (ids, name) => { await controller.createGroup(ids, name); }} onRenameGroup={async (id, name) => { await controller.renameGroup(id, name); }} onDissolveGroup={async (id) => { await controller.dissolveGroup(id); }} onMoveItem={async (id, groupId, ids) => { await controller.moveItem(id, groupId, ids); }} onClose={() => void close()} /></div>}
  </div>;
}
