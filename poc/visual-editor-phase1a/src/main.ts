import {
  commandsCtx,
  defaultValueCtx,
  editorViewCtx,
  Editor,
  rootCtx,
} from "@milkdown/kit/core";
import type { Ctx } from "@milkdown/kit/ctx";
import { clipboard } from "@milkdown/kit/plugin/clipboard";
import { history } from "@milkdown/kit/plugin/history";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import {
  addColAfterCommand,
  addRowAfterCommand,
  addRowBeforeCommand,
  addColBeforeCommand,
  deleteSelectedCellsCommand,
  selectColCommand,
  selectRowCommand,
  setAlignCommand,
  gfm,
  keepTableAlignPlugin,
  remarkGFMPlugin,
  tableEditingPlugin,
} from "@milkdown/kit/preset/gfm";
import { addRowAfter, goToNextCell } from "@milkdown/kit/prose/tables";
import { Plugin } from "@milkdown/kit/prose/state";
import { $prose, $remark } from "@milkdown/kit/utils";
import "@milkdown/prose/view/style/prosemirror.css";
import "./style.css";
import {
  buildBenchmarkMarkdown,
  parseBenchmarkEditorProfile,
  parseBenchmarkBytes,
  parseBenchmarkFixture,
  parseBenchmarkLayout,
  parseBenchmarkTableCount,
} from "./benchmarkMode";
import { installBenchmarkDomVirtualization } from "./benchmarkDomVirtualization";
import {
  rawHtmlCommentRemark,
  rawHtmlCommentSchema,
} from "./rawHtmlComment";
import { incrementalTableAlignPlugin } from "./tableAlignmentRuntime";
import { remarkGfmFastTable } from "./fastGfmTableParser";

const INITIAL_MARKDOWN = `# Phase 1A 结构化编辑

这是一份不连接生产保存的临时文档。可以直接输入中文、使用快捷格式、列表和任务。

- 先写事实
  - 再补充行动项

- [ ] 待完成的事情
- [x] 已完成的事情

| 项目 | 状态 |
| --- | --- |
| 编辑器 | 进行中 |
| 粘贴 | 待验证 |
`;

const benchmarkBytes = parseBenchmarkBytes(window.location.search);
const benchmarkEditorProfile = parseBenchmarkEditorProfile(
  window.location.search,
);
const benchmarkFixture = parseBenchmarkFixture(window.location.search);
const benchmarkLayout = parseBenchmarkLayout(window.location.search);
const benchmarkTableCount = parseBenchmarkTableCount(window.location.search);
if (benchmarkLayout !== "normal") {
  document.documentElement.dataset.benchmarkLayout = benchmarkLayout;
}
const initialMarkdown =
  benchmarkBytes === null
    ? INITIAL_MARKDOWN
    : buildBenchmarkMarkdown(
        benchmarkBytes,
        benchmarkFixture,
        benchmarkTableCount,
      );
const isBenchmarkMode = benchmarkBytes !== null;

const fastGfmTableRemarkPlugin = $remark(
  "remarkGfmFastTable",
  () => remarkGfmFastTable,
);
const gfmWithoutTableRuntime = gfm.filter(
  (plugin) =>
    plugin !== keepTableAlignPlugin &&
    plugin !== tableEditingPlugin &&
    plugin !== remarkGFMPlugin.plugin,
);
const gfmWithoutTableAlignRuntime = gfm.filter(
  (plugin) => plugin !== keepTableAlignPlugin && plugin !== remarkGFMPlugin.plugin,
);
const gfmWithoutTableEditingRuntime = gfm.filter(
  (plugin) => plugin !== tableEditingPlugin && plugin !== remarkGFMPlugin.plugin,
);

const root = document.querySelector<HTMLElement>("#editor");
const output = document.querySelector<HTMLPreElement>("#markdown-output");
const status = document.querySelector<HTMLElement>("#editor-status");
const tableTools = document.querySelector<HTMLElement>("#table-tools");

if (!root || !output || !status || !tableTools) {
  throw new Error("Phase 1A PoC DOM mount points are missing");
}

interface TableContext {
  rowIndex: number;
  colIndex: number;
}

let editorCtx: Ctx | null = null;
let activeTableContext: TableContext | null = null;

const findTableContext = (target: EventTarget | null): TableContext | null => {
  if (!(target instanceof HTMLElement)) return null;

  const cell = target.closest<HTMLTableCellElement>("td, th");
  const table = cell?.closest<HTMLTableElement>("table");
  const row = cell?.closest<HTMLTableRowElement>("tr");
  if (!cell || !table || !row) return null;

  const rows = Array.from(table.querySelectorAll("tr"));
  const rowIndex = rows.indexOf(row);
  if (rowIndex < 0 || cell.cellIndex < 0) return null;

  return { rowIndex, colIndex: cell.cellIndex };
};

const updateTableTools = (context: TableContext | null): void => {
  activeTableContext = context;
  tableTools.hidden = context === null;
  if (context) {
    tableTools.dataset.rowIndex = String(context.rowIndex);
    tableTools.dataset.colIndex = String(context.colIndex);
  }
};

root.addEventListener("click", (event) => {
  updateTableTools(findTableContext(event.target));
});

tableTools.addEventListener("mousedown", (event) => {
  // Keep the ProseMirror selection in the active cell while clicking a tool.
  event.preventDefault();
});

let latestMarkdown = initialMarkdown;

const renderTemporaryMarkdown = (markdown: string): void => {
  latestMarkdown = markdown;
  output.textContent = latestMarkdown;
};

const setStatus = (state: "ready" | "error", message: string): void => {
  status.dataset.state = state;
  status.textContent = message;
};

// Milkdown's GFM preset supplies the task-list schema and serializer, but it
// leaves the checkbox affordance to the host application. The PoC owns only
// this small interaction so task toggling exercises a real ProseMirror
// transaction instead of mutating the DOM.
const taskListClick = $prose(
  () =>
    new Plugin({
      props: {
        handleClick: (view, _pos, event) => {
          const target = event.target;
          if (!(target instanceof HTMLElement)) return false;

          const item = target.closest<HTMLElement>(
            'li[data-item-type="task"]',
          );
          if (!item || !view.dom.contains(item)) return false;

          const rect = item.getBoundingClientRect();
          if (event.clientX - rect.left > 28) return false;

          try {
            const domPosition = view.posAtDOM(item, 0);
            const resolved = view.state.doc.resolve(domPosition);
            for (let depth = resolved.depth; depth > 0; depth -= 1) {
              const node = resolved.node(depth);
              if (node.attrs.checked === null || node.attrs.checked === undefined) {
                continue;
              }

              const position = resolved.before(depth);
              view.dispatch(
                view.state.tr.setNodeMarkup(position, undefined, {
                  ...node.attrs,
                  checked: !node.attrs.checked,
                }),
              );
              return true;
            }
          } catch {
            // A stale DOM position should not turn a checkbox click into an
            // editor error; ProseMirror will restore the current selection.
          }

          return false;
        },
      },
  }),
);

const tableKeyboard = $prose(
  () =>
    new Plugin({
      props: {
        handleKeyDown: (view, event) => {
          if (event.key !== "Tab") return false;

          const direction = event.shiftKey ? -1 : 1;
          if (goToNextCell(direction)(view.state, view.dispatch)) {
            event.preventDefault();
            return true;
          }

          if (!event.shiftKey && addRowAfter(view.state, view.dispatch)) {
            goToNextCell(1)(view.state, view.dispatch);
            event.preventDefault();
            return true;
          }

          return false;
        },
      },
  }),
);

const benchmarkTimingProbe = $prose(
  () =>
    new Plugin({
      state: {
        init: () => {
          performance.mark("mknote-editor-state-init");
          return null;
        },
        apply: (_transaction, value) => value,
      },
      view: () => {
        performance.mark("mknote-editor-view-init");
        return {};
      },
    }),
);

const executeTableAction = (action: string): void => {
  if (!editorCtx) return;

  const commands = editorCtx.get(commandsCtx);
  switch (action) {
    case "add-row-before":
      commands.call(addRowBeforeCommand.key);
      break;
    case "add-row-after":
      commands.call(addRowAfterCommand.key);
      break;
    case "add-col-before":
      commands.call(addColBeforeCommand.key);
      break;
    case "add-col-after":
      commands.call(addColAfterCommand.key);
      break;
    case "delete-row":
      if (activeTableContext) {
        commands.call(selectRowCommand.key, { index: activeTableContext.rowIndex });
        commands.call(deleteSelectedCellsCommand.key);
      }
      break;
    case "delete-col":
      if (activeTableContext) {
        commands.call(selectColCommand.key, { index: activeTableContext.colIndex });
        commands.call(deleteSelectedCellsCommand.key);
      }
      break;
    case "align-left":
      commands.call(setAlignCommand.key, "left");
      break;
    case "align-center":
      commands.call(setAlignCommand.key, "center");
      break;
    case "align-right":
      commands.call(setAlignCommand.key, "right");
      break;
    default:
      return;
  }

  editorCtx.get(editorViewCtx).focus();
};

tableTools.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;
  executeTableAction(target.dataset.tableAction ?? "");
});

const createEditor = async (): Promise<void> => {
  performance.mark("mknote-editor-create-start");
  const editor = Editor.make()
    .config((ctx) => {
      editorCtx = ctx;
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, initialMarkdown);
      if (!isBenchmarkMode) {
        ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
          // 普通 PoC 观察结构化 serializer 结果，但 benchmark 只测编辑器输入路径。
          renderTemporaryMarkdown(markdown);
        });
      }
    })
  .use(
    isBenchmarkMode
      ? [...rawHtmlCommentSchema, ...rawHtmlCommentRemark]
      : [],
  )
  .use(commonmark);

  // no-gfm 只用于把通用 ProseMirror / DOM 成本与 GFM 表格 schema 成本分开。
  // 普通 PoC 保留完整 GFM schema；alignment 修复改为只扫描受影响表格。
  if (
    !isBenchmarkMode ||
    benchmarkEditorProfile === "normal" ||
    benchmarkEditorProfile === "virtualized-blocks"
  ) {
    editor.use(gfmWithoutTableAlignRuntime).use(incrementalTableAlignPlugin);
  } else if (benchmarkEditorProfile === "no-table-runtime") {
    // 仅用于定位初始化成本；表格 schema 和 GFM 解析仍保留，移除会遍历/修复整棵表格文档的运行时插件。
    editor.use(gfmWithoutTableRuntime);
  } else if (benchmarkEditorProfile === "no-table-align-runtime") {
    // 仅用于区分 keepTableAlignPlugin 的全树扫描成本，不代表可交付表格行为。
    editor.use(gfmWithoutTableAlignRuntime);
  } else if (benchmarkEditorProfile === "no-table-editing-runtime") {
    // 仅用于区分 prosemirror-tables tableEditing / fixTables 的成本，不代表可交付表格行为。
    editor.use(gfmWithoutTableEditingRuntime);
  } else if (benchmarkEditorProfile === "incremental-table-align-runtime") {
    // 仅用于验证受控 table alignment 修复，不代表已批准替换 GFM 默认运行时。
    editor.use(gfmWithoutTableAlignRuntime).use(incrementalTableAlignPlugin);
  }

  if (benchmarkEditorProfile !== "no-gfm") {
    editor.use(fastGfmTableRemarkPlugin);
  }

  editor.use(history).use(clipboard);

  if (!isBenchmarkMode) {
    editor.use(listener);
  }

  if (isBenchmarkMode) {
    editor.use(benchmarkTimingProbe);
  }

  await editor
    .use(taskListClick)
    .use(tableKeyboard)
    .create();

  if (benchmarkEditorProfile === "virtualized-blocks") {
    // 仅用于量化 DOM windowing 的方向；普通 PoC 保持完整可编辑文档。
    const editorDom = editorCtx?.get(editorViewCtx).dom;
    if (editorDom instanceof HTMLElement) {
      installBenchmarkDomVirtualization(editorDom, { windowSize: 24 });
    }
  }

  performance.mark("mknote-editor-create-end");

  renderTemporaryMarkdown(latestMarkdown);
  setStatus("ready", "结构化状态就绪 · 未接生产保存");
  performance.mark("mknote-editor-ready");
};

void createEditor().catch((error: unknown) => {
  console.error("Phase 1A editor failed to mount", error);
  setStatus("error", "PoC 挂载失败");
});
