import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const editorFormatSource = readFileSync("src/utils/editorFormat.ts", "utf8");
const compactViewSource = readFileSync("src/components/CompactView.tsx", "utf8");
const sessionSource = readFileSync("src/visual-editor/visualEditorSession.ts", "utf8");
const adapterSource = readFileSync("src/visual-editor/visualEditorAdapter.ts", "utf8");
const visualEditorCssSource = readFileSync("src/components/VisualEditor.css", "utf8");

const formatActions = [...editorFormatSource.matchAll(/^\s*\|\s*"([^"]+)"/gm)].map(
  (match) => match[1],
);

function objectBody(source: string, name: string): string {
  const match = source.match(new RegExp(`const ${name}[^=]*=\\s*\\{([\\s\\S]*?)\\n\\};`));
  assert.ok(match, `缺少 ${name}`);
  return match[1];
}

function setBody(source: string, name: string): string {
  const match = source.match(new RegExp(`const ${name}[^=]*=\\s*new Set[^\\[]*\\[([\\s\\S]*?)\\]`));
  assert.ok(match, `缺少 ${name}`);
  return match[1];
}

test("每个 FormatAction 都有 Visual 命令、源码回退或外部资源处理路径", () => {
  const visualCommandBody = objectBody(compactViewSource, "VISUAL_FORMAT_COMMANDS");
  const fallbackBody = setBody(compactViewSource, "VISUAL_FORMAT_FALLBACK_ACTIONS");
  const mappedActions = [...visualCommandBody.matchAll(/\b([A-Za-z][A-Za-z0-9]*)\s*:/g)].map(
    (match) => match[1],
  );
  const fallbackActions = [...fallbackBody.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  const externallyHandled = compactViewSource.includes('action === "image"') ? ["image"] : [];

  assert.deepEqual(
    [...new Set([...mappedActions, ...fallbackActions, ...externallyHandled])].sort(),
    [...new Set(formatActions)].sort(),
  );
  assert.match(compactViewSource, /VISUAL_FORMAT_FALLBACK_ACTIONS/);
  assert.match(compactViewSource, /applyFormatToTextarea/);
  assert.match(compactViewSource, /onOpenSourceEditor|onTogglePreview/);
});

test("Visual Editor 命令覆盖工具栏要求的原生编辑语义", () => {
  const requiredCommands = [
    "bold",
    "italic",
    "strikethrough",
    "heading-1",
    "heading-2",
    "heading-3",
    "bullet-list",
    "ordered-list",
    "blockquote",
    "inline-code",
    "code-block",
    "task",
    "task-done",
    "indent",
    "outdent",
    "insert-divider",
    "insert-table",
    "link",
  ];

  for (const command of requiredCommands) {
    assert.match(sessionSource, new RegExp(`"${command}"`), `缺少 VisualEditorCommand: ${command}`);
    assert.match(adapterSource, new RegExp(`"${command}"|case ${JSON.stringify(command)}`), `适配器未处理命令: ${command}`);
  }
});

test("任务列表必须有可点击的 Visual 节点、ProseMirror 状态更新和 Markdown 序列化", () => {
  assert.match(adapterSource, /nodeViews/);
  assert.match(adapterSource, /type\s*=\s*["']checkbox["']/);
  assert.match(adapterSource, /setNodeMarkup/);
  assert.match(adapterSource, /checked/);
  assert.match(adapterSource, /ctx\.get\(serializerCtx\)\(view\.state\.doc\)/);
  assert.match(adapterSource, /\.use\(gfm\)/);
  assert.match(visualEditorCssSource, /li\[data-item-type=["']task["']\]/);
  assert.match(visualEditorCssSource, /input\[type=["']checkbox["']\]/);
});

