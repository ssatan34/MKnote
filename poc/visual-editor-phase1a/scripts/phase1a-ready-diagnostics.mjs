const READY_MARK_NAMES = [
  "mknote-editor-create-start",
  "mknote-editor-state-init",
  "mknote-editor-view-init",
  "mknote-editor-create-end",
  "mknote-editor-ready",
];

export function classifyReadyTimeout(snapshot) {
  const statusState = snapshot?.status?.state ?? null;
  const timing = snapshot?.timing ?? {};
  const editor = snapshot?.editor ?? {};

  if (statusState === "error") return "editor-init-error";
  if (statusState === "ready" || timing.readyMarkCount > 0) {
    return "ready-observation-race";
  }
  if (timing.createEndMarkCount > 0 && editor.exists) {
    return "ready-mark-missing";
  }
  if (
    timing.createStartMarkCount > 0 ||
    timing.stateInitMarkCount > 0 ||
    timing.viewInitMarkCount > 0 ||
    editor.exists
  ) {
    return "editor-create-incomplete";
  }
  return "editor-create-not-started";
}

export async function captureReadyDiagnostics(page, browserEvents = null) {
  const snapshot = await page.evaluate((markNames) => {
    const status = document.querySelector("#editor-status");
    const editor = document.querySelector(".ProseMirror");
    const root = document.querySelector("#editor");
    const entries = performance
      .getEntriesByType("mark")
      .filter((entry) => markNames.includes(entry.name))
      .map((entry) => ({
        name: entry.name,
        startTime: entry.startTime,
        duration: entry.duration,
      }));
    const count = (name) => entries.filter((entry) => entry.name === name).length;

    return {
      url: window.location.href,
      documentReadyState: document.readyState,
      documentVisibility: document.visibilityState,
      hasFocus: document.hasFocus(),
      status: {
        exists: status !== null,
        state: status?.getAttribute("data-state") ?? null,
        text: status?.textContent ?? null,
      },
      root: {
        exists: root !== null,
        childCount: root?.children.length ?? 0,
      },
      editor: {
        exists: editor !== null,
        connected: editor?.isConnected ?? false,
        contentEditable: editor?.getAttribute("contenteditable") ?? null,
        rootChildCount: editor?.children.length ?? 0,
        descendantElementCount: editor?.querySelectorAll("*").length ?? 0,
        textContentLength: editor?.textContent?.length ?? 0,
      },
      timing: {
        createStartMarkCount: count("mknote-editor-create-start"),
        stateInitMarkCount: count("mknote-editor-state-init"),
        viewInitMarkCount: count("mknote-editor-view-init"),
        createEndMarkCount: count("mknote-editor-create-end"),
        readyMarkCount: count("mknote-editor-ready"),
        marks: entries,
      },
    };
  }, READY_MARK_NAMES);

  const diagnostics = {
    ...snapshot,
    classification: classifyReadyTimeout(snapshot),
  };

  if (browserEvents) {
    diagnostics.browserEvents = {
      pageErrors: [...(browserEvents.pageErrors ?? [])],
      consoleErrors: [...(browserEvents.consoleErrors ?? [])],
      requestFailures: [...(browserEvents.requestFailures ?? [])],
      responses: [...(browserEvents.responses ?? [])],
    };
  }

  return diagnostics;
}
