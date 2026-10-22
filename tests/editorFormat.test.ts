import assert from "node:assert/strict";
import test from "node:test";
import {
  applyFormatToTextarea,
  FONT_TOOLBAR_ITEMS,
  MARKDOWN_TOOLBAR_GROUPS,
  type FormatAction,
} from "../src/utils/editorFormat.ts";

function createTextarea(value: string, selectionStart: number, selectionEnd = selectionStart): HTMLTextAreaElement {
  return {
    value,
    selectionStart,
    selectionEnd,
    focus() {},
  } as HTMLTextAreaElement;
}

const toolbarActions = [
  ...FONT_TOOLBAR_ITEMS.map((item) => item.action),
  ...MARKDOWN_TOOLBAR_GROUPS.flatMap((group) => group.items.map((item) => item.action)),
];

test("工具栏动作集合覆盖每个 FormatAction 且没有重复按钮", () => {
  const declaredActions = [
    "bold",
    "italic",
    "strikethrough",
    "underline",
    "highlight",
    "caseTransform",
    "task",
    "taskDone",
    "indent",
    "outdent",
    "h1",
    "h2",
    "h3",
    "ul",
    "ol",
    "blockquote",
    "inlineCode",
    "codeBlock",
    "link",
    "image",
    "table",
    "hr",
    "clearFormat",
  ] satisfies FormatAction[];

  assert.deepEqual([...new Set(toolbarActions)].sort(), [...declaredActions].sort());
  assert.equal(toolbarActions.length, new Set(toolbarActions).size);
});

test("源码模式下工具栏动作生成可保存的 Markdown", () => {
  const cases: Array<{ action: FormatAction; value: string; expected: string }> = [
    { action: "bold", value: "文本", expected: "**文本**" },
    { action: "italic", value: "文本", expected: "*文本*" },
    { action: "strikethrough", value: "文本", expected: "~~文本~~" },
    { action: "underline", value: "文本", expected: "<u>文本</u>" },
    { action: "highlight", value: "文本", expected: "==文本==" },
    { action: "caseTransform", value: "hello", expected: "Hello" },
    { action: "task", value: "完成准备", expected: "- [ ] 完成准备" },
    { action: "taskDone", value: "- [ ] 完成准备", expected: "- [x] 完成准备" },
    { action: "indent", value: "条目", expected: "  条目" },
    { action: "outdent", value: "  条目", expected: "条目" },
    { action: "h1", value: "标题", expected: "# 标题" },
    { action: "h2", value: "标题", expected: "## 标题" },
    { action: "h3", value: "标题", expected: "### 标题" },
    { action: "ul", value: "条目", expected: "- 条目" },
    { action: "ol", value: "条目", expected: "1. 条目" },
    { action: "blockquote", value: "引用", expected: "> 引用" },
    { action: "inlineCode", value: "代码", expected: "`代码`" },
    { action: "codeBlock", value: "代码", expected: "```\n代码\n```" },
    { action: "link", value: "链接", expected: "[链接](https://)" },
    { action: "image", value: "图片", expected: "![图片](https://)" },
    { action: "table", value: "", expected: "| 列1 | 列2 |" },
    { action: "hr", value: "", expected: "---" },
    { action: "clearFormat", value: "**文本**", expected: "文本" },
  ];

  for (const { action, value, expected } of cases) {
    const textarea = createTextarea(value, 0, value.length);
    const actual = applyFormatToTextarea(textarea, action);
    if (action === "table") {
      assert.match(actual, /^\| 列1 \| 列2 \|\r?\n\| --- \| --- \|/, `源码动作 ${action} 未生成预期 Markdown`);
    } else {
      assert.equal(actual, expected, `源码动作 ${action} 未生成预期 Markdown`);
    }
  }
});
