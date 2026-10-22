import { useEffect, useRef, useState } from "react";
import { CloseButton } from "./CloseButton";
import type { GlobalHotkeys } from "../types";

interface HotkeyPanelProps {
  hotkeys: GlobalHotkeys;
  onSave: (hotkeys: GlobalHotkeys) => void | Promise<void>;
  onClose?: () => void;
  embedded?: boolean;
}

const FIELDS: Array<{ key: keyof GlobalHotkeys; label: string; hint: string }> = [
  {
    key: "toggle_window",
    label: "显示 / 隐藏窗口",
    hint: "全局切换主窗口；留空则禁用（仍可用托盘）",
  },
  {
    key: "focus_window",
    label: "拉到前台并聚焦",
    hint: "窗口不在前台时拉起；已在前台时隐藏到托盘",
  },
  {
    key: "clipboard_inbox",
    label: "剪贴板收集",
    hint: "将剪贴板文本保存到 Inbox，如 Alt+Shift+C",
  },
  {
    key: "quick_search",
    label: "全文搜索",
    hint: "打开搜索面板；应用内仍可用 Ctrl+P",
  },
];

const MODIFIERS = ["Ctrl", "Shift", "Alt"] as const;
type Modifier = typeof MODIFIERS[number];

/** 将 "Ctrl+Shift+Alt+N" 解析为修饰键数组 + 主键 */
function parseHotkey(value: string): { mods: Set<Modifier>; main: string } {
  if (!value.trim()) return { mods: new Set(), main: "" };
  const parts = value.split("+").map((k) => k.trim()).filter(Boolean);
  const mods = new Set<Modifier>();
  let main = "";
  for (const p of parts) {
    if ((MODIFIERS as readonly string[]).includes(p)) {
      mods.add(p as Modifier);
    } else {
      main = p;
    }
  }
  return { mods, main };
}

/** 将修饰键 + 主键组合为字符串 */
function buildHotkey(mods: Set<Modifier>, main: string): string {
  if (!main) return "";
  const parts: string[] = [];
  for (const m of MODIFIERS) {
    if (mods.has(m)) parts.push(m);
  }
  parts.push(main);
  return parts.join("+");
}

/** 把键盘事件的主键规范化为显示名 */
function normalizeMainKey(e: KeyboardEvent): string {
  const k = e.key;
  if (k === " ") return "Space";
  if (k.length === 1) return k.toUpperCase();
  return k;
}

const IGNORED_KEYS = new Set(["Control", "Shift", "Alt", "Meta", "Dead", "Process"]);

/** KeyBadge 单个按键胶囊 */
function KeyBadge({ label }: { label: string }) {
  return <span className="hotkey-key-badge">{label}</span>;
}

/** 快捷键选择器：修饰键按钮 + 主键录入 + 预览 */
function ShortcutRecorder({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { mods: savedMods, main: savedMain } = parseHotkey(value);

  // pendingMods：尚未提交（没有主键时）的修饰键暂存
  // 有已保存值时用已保存的；没有时用暂存的
  const [pendingMods, setPendingMods] = useState<Set<Modifier>>(new Set());
  const [recording, setRecording] = useState(false);
  const inputRef = useRef<HTMLDivElement>(null);

  // 当前展示的修饰键：有主键时用已保存的，没有主键时用暂存的
  const displayMods = savedMain ? savedMods : pendingMods;

  const toggleMod = (mod: Modifier) => {
    if (savedMain) {
      // 已有主键：直接更新 value
      const next = new Set(savedMods);
      if (next.has(mod)) next.delete(mod);
      else next.add(mod);
      onChange(buildHotkey(next, savedMain));
    } else {
      // 无主键：先暂存修饰键，等待录入主键
      setPendingMods((prev) => {
        const next = new Set(prev);
        if (next.has(mod)) next.delete(mod);
        else next.add(mod);
        return next;
      });
    }
  };

  const startRecording = () => {
    setRecording(true);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!recording) return;
    e.preventDefault();
    e.stopPropagation();

    if (e.key === "Escape") {
      setRecording(false);
      return;
    }
    if (e.key === "Backspace" || e.key === "Delete") {
      // 清除主键，保留修饰键暂存
      setPendingMods(new Set(savedMods));
      onChange("");
      setRecording(false);
      return;
    }
    if (IGNORED_KEYS.has(e.key)) return;

    const key = normalizeMainKey(e.nativeEvent);
    // 用当前显示的修饰键（pendingMods 或 savedMods）+ 新主键提交
    const modsToUse = savedMain ? savedMods : pendingMods;
    onChange(buildHotkey(modsToUse, key));
    setPendingMods(new Set()); // 提交后清空暂存
    setRecording(false);
  };

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPendingMods(new Set());
    onChange("");
  };

  const displayKeys = value ? value.split("+").filter(Boolean) : [];

  return (
    <div className="hotkey-recorder">
      {/* 修饰键按钮组 */}
      <span className="hotkey-recorder-mods">
        {MODIFIERS.map((mod) => (
          <button
            key={mod}
            type="button"
            className={`hotkey-mod-btn${displayMods.has(mod) ? " active" : ""}`}
            onClick={() => toggleMod(mod)}
            aria-pressed={displayMods.has(mod)}
          >
            {mod}
          </button>
        ))}
      </span>

      {/* 主键录入区 */}
      <div
        ref={inputRef}
        tabIndex={0}
        className={`hotkey-main-input${recording ? " recording" : ""}`}
        onClick={startRecording}
        onKeyDown={handleKeyDown}
        onBlur={() => setRecording(false)}
        role="button"
        aria-label={savedMain ? `主键：${savedMain}，点击更换` : "点击录入主键"}
        title={recording ? "按下主键（Esc 取消 / Backspace 清除主键）" : "点击录入主键"}
      >
        {recording ? (
          <span className="hotkey-main-input-hint">按键…</span>
        ) : savedMain ? (
          <KeyBadge label={savedMain} />
        ) : (
          <span className="hotkey-main-input-hint">主键</span>
        )}
      </div>

      {/* 右侧：完整预览 + 清除 */}
      <span className="hotkey-recorder-preview">
        {displayKeys.length > 0 ? (
          <>
            {displayKeys.map((k, i) => <KeyBadge key={i} label={k} />)}
            <button
              type="button"
              className="hotkey-clear-btn"
              onClick={clear}
              title="清除"
              aria-label="清除快捷键"
            >×</button>
          </>
        ) : pendingMods.size > 0 ? (
          // 已选修饰键但还没录主键时的预览
          <>
            {MODIFIERS.filter((m) => pendingMods.has(m)).map((k, i) => (
              <KeyBadge key={i} label={k} />
            ))}
            <span className="hotkey-pending-hint">+ 主键?</span>
            <button
              type="button"
              className="hotkey-clear-btn"
              onClick={clear}
              title="清除"
              aria-label="清除快捷键"
            >×</button>
          </>
        ) : (
          <span className="hotkey-recorder-hint">未设置</span>
        )}
      </span>
    </div>
  );
}

export function HotkeyPanel({ hotkeys, onSave, onClose, embedded = false }: HotkeyPanelProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState(hotkeys);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>("所有更改已保存");

  useEffect(() => {
    setDraft(hotkeys);
  }, [hotkeys]);

  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
  }, []);

  // 任何字段变动时清除"已保存"状态
  const handleChange = (key: keyof GlobalHotkeys, value: string) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setSaveMsg(null);
  };

  const submit = async () => {
    setSaveMsg(null);
    setSaving(true);
    try {
      await onSave({
        toggle_window: draft.toggle_window.trim(),
        focus_window: draft.focus_window.trim(),
        clipboard_inbox: draft.clipboard_inbox.trim(),
        quick_search: draft.quick_search.trim(),
        quick_capture: draft.quick_capture ?? "",
      });
      setSaveMsg("所有更改已保存");
      onClose?.();
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      ref={rootRef}
      className={embedded ? "settings-embedded-panel hotkey-panel" : "siyuan-settings-popover hotkey-panel"}
      data-no-drag
      tabIndex={-1}
      onBlur={(e) => {
        if (embedded || !onClose) return;
        const related = e.relatedTarget as Node | null;
        if (e.currentTarget.contains(related)) return;
        if (related instanceof Element && related.closest("[data-popover-trigger]")) return;
        onClose();
      }}
    >
      {/* 标题区 */}
      <div className="hotkey-panel-heading">
        <div className="hotkey-panel-title-row">
          <strong className="hotkey-panel-title">全局快捷键</strong>
          {!embedded && onClose && (
            <CloseButton title="关闭" aria-label="关闭" onClick={onClose} />
          )}
        </div>
        <p className="hotkey-panel-desc">
          在应用之外也可触发。格式如{" "}
          <code className="hotkey-inline-code">Ctrl+Shift+N</code>
          。若与系统或其他软件冲突，请更换组合键。
        </p>
      </div>

      {/* 表头 */}
      <div className="hotkey-table-header">
        <span className="hotkey-col-label">功能</span>
        <span className="hotkey-col-key">快捷键</span>
      </div>

      {/* 快捷键行 */}
      <div className="hotkey-rows">
        {FIELDS.map(({ key, label, hint }) => (
          <div key={key} className="hotkey-row">
            <div className="hotkey-row-info">
              <span className="hotkey-row-label">{label}</span>
              <span className="hotkey-row-hint">{hint}</span>
            </div>
            <ShortcutRecorder
              value={draft[key] ?? ""}
              onChange={(v) => handleChange(key, v)}
            />
          </div>
        ))}
      </div>

      {/* 底部操作栏 */}
      <div className="hotkey-panel-footer">
        <span className={`hotkey-save-msg${saveMsg && saveMsg !== "所有更改已保存" ? " hotkey-save-msg--error" : ""}`}>
          {saveMsg ?? ""}
        </span>
        <button
          type="button"
          className="hotkey-save-btn mk-save-button"
          disabled={saving}
          onClick={() => void submit()}
        >
          <span>Save</span>
        </button>
      </div>
    </div>
  );
}
