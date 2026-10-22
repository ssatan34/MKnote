import ReactDOM from "react-dom/client";
import "./styles/tokens.css";
import "./styles/tailwind.css";
import { getCurrentWindow } from "@tauri-apps/api/window";

const isUiPlayground = new URLSearchParams(window.location.search).get("ui-playground") === "1";

/** 把致命错误直接画到页面上，杜绝静默白屏。 */
function renderFatal(where: string, err: unknown) {
  const root = document.getElementById("root");
  const msg = err instanceof Error ? `${err.message}\n\n${err.stack ?? ""}` : String(err);
  if (root) {
    root.innerHTML =
      `<div style="padding:16px;font:13px/1.5 monospace;color:#c00;white-space:pre-wrap;background:#fff;height:100%;overflow:auto">` +
      `[启动失败 @ ${where}]\n\n${msg.replace(/</g, "&lt;")}</div>`;
  }
  // eslint-disable-next-line no-console
  console.error(`[main.tsx] fatal @ ${where}`, err);
}

async function main() {
  const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);

  if (isUiPlayground) {
    const { UiPlayground } = await import("./pages/UiPlayground");
    root.render(<UiPlayground />);
    return;
  }

  // 通过窗口 label 判断窗口形态。
  const currentWindow = getCurrentWindow();
  let label = "";
  try {
    label = currentWindow.label;
  } catch (e) {
    renderFatal("getCurrentWindow().label", e);
    return;
  }
  const isPopout = label.startsWith("popout-");
  const isCapsule = label.startsWith("capsule-");
  const isTabDragPreview = label === "tab-drag-preview";
  const isQuickTodoReminder = label.startsWith("quick-todo-reminder-");
  const isQuickTodo = label.startsWith("quick-todo-") && !isQuickTodoReminder;
  const isQuickPocket = label.startsWith("quick-pocket-");
  if (isCapsule || isTabDragPreview) {
    document.documentElement.style.background = "transparent";
    document.body.classList.add(isTabDragPreview ? "tab-drag-preview-window" : "capsule-window");
  }
  // eslint-disable-next-line no-console
  console.log("[main.tsx] label=", label, " isPopout=", isPopout, " isCapsule=", isCapsule);

  if (isQuickTodo) {
    const { QuickTodoShell } = await import("./components/QuickTodoShell");
    root.render(<QuickTodoShell />);
  } else if (isQuickTodoReminder) {
    const { QuickTodoReminderShell } = await import("./components/QuickTodoReminderShell");
    root.render(<QuickTodoReminderShell />);
  } else if (isQuickPocket) {
    const { QuickPocketShell } = await import("./components/QuickPocketShell");
    root.render(<QuickPocketShell />);
  } else if (isPopout) {
    const { PopoutView } = await import("./components/PopoutView");
    root.render(<PopoutView />);
  } else if (isCapsule) {
    // 胶囊窗口：透明背景（窗口已在 Rust 侧设为 transparent）
    const { CapsuleView } = await import("./components/CapsuleView");
    root.render(<CapsuleView />);
  } else if (isTabDragPreview) {
    const { TabDragPreviewView } = await import("./components/TabDragPreviewView");
    root.render(<TabDragPreviewView />);
  } else {
    const { default: App } = await import("./App");
    root.render(<App />);
  }
}

void main().catch((e) => renderFatal("main()", e));
