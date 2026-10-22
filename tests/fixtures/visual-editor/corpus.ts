export const VISUAL_EDITOR_CLASSIFICATIONS = [
  "native",
  "normalize",
  "raw",
  "safe-source",
] as const;

export type VisualEditorClassification = (typeof VISUAL_EDITOR_CLASSIFICATIONS)[number];

export interface VisualEditorFixture {
  id: string;
  title: string;
  classification: VisualEditorClassification;
  syntax: string[];
  markdown: string;
  notes: string;
}

const CORE_FIXTURES: VisualEditorFixture[] = [
  {
    id: "gfm-basic-inline",
    title: "GFM 基础行内语法",
    classification: "native",
    syntax: ["gfm", "paragraph", "strong", "emphasis", "strikethrough", "link", "inline-code"],
    markdown: "# 基础记录\n\n**重要**、*强调*、~~删除~~、`代码`和[链接](https://example.com)。",
    notes: "常用段落与行内格式。",
  },
  {
    id: "gfm-blocks",
    title: "GFM 块级结构",
    classification: "native",
    syntax: ["gfm", "blockquote", "unordered-list", "ordered-list", "thematic-break"],
    markdown: "> 先记录事实\n> 再补充行动项\n\n- 一项\n  - 子项\n1. 第一步\n2. 第二步\n\n---",
    notes: "块引用、嵌套列表和分割线。",
  },
  {
    id: "front-matter",
    title: "YAML Front Matter",
    classification: "raw",
    syntax: ["front-matter", "raw-block"],
    markdown: "---\ntitle: 保留标题\ntags:\n  - demo\ncreated: 2026-08-21\n---\n\n正文必须保持原文。",
    notes: "进入新编辑器前需要 source-aware 原子块。",
  },
  {
    id: "footnotes",
    title: "脚注",
    classification: "safe-source",
    syntax: ["footnotes", "unknown-block"],
    markdown: "正文带脚注[^one]。\n\n[^one]: 这段脚注在当前 Lute 配置中不作为日常可视化编辑能力。",
    notes: "当前配置关闭 SetFootnotes，必须先安全回退。",
  },
  {
    id: "setext-heading",
    title: "Setext 标题",
    classification: "normalize",
    syntax: ["setext", "heading"],
    markdown: "Setext 标题\n============\n\n正文。",
    notes: "允许规范化边界需由 Owner 在 Gate A 前确认。",
  },
  {
    id: "raw-html-block",
    title: "原始 HTML 块",
    classification: "raw",
    syntax: ["html", "raw-block"],
    markdown: "<details>\n<summary>原始折叠标题</summary>\n\n原始 HTML 内容\n\n</details>",
    notes: "不可执行原子块，不允许静默清除。",
  },
  {
    id: "html-comment",
    title: "HTML 注释",
    classification: "raw",
    syntax: ["html-comment", "raw-block"],
    markdown: "正文前的注释<!-- mknote: metadata=keep -->\n\n正文后的注释。",
    notes: "需要按 source span 原样保留。",
  },
  {
    id: "siyuan-block-ref",
    title: "思源块引用",
    classification: "raw",
    syntax: ["siyuan-block-ref", "unknown-inline"],
    markdown: "引用块 ^20260821120000-abc123\n\n((20260821120000-abc123 '显示文本'))",
    notes: "思源扩展先作为原文原子 inline/block 处理。",
  },
  {
    id: "siyuan-ial",
    title: "思源 IAL",
    classification: "raw",
    syntax: ["siyuan-ial", "unknown-block"],
    markdown: "带属性的段落\n{: id=20260821120000-abc123 updated=20260821120000}",
    notes: "不允许由普通 Markdown serializer 猜测重建。",
  },
  {
    id: "wikilink",
    title: "Wikilink",
    classification: "raw",
    syntax: ["wikilink", "unknown-inline"],
    markdown: "参见 [[项目计划]]，也可以使用 [[项目计划|计划别名]]。",
    notes: "后续由 Wikilink 节点接管，当前需保护原文。",
  },
  {
    id: "callout",
    title: "Callout",
    classification: "native",
    syntax: ["callout", "blockquote"],
    markdown: "> [!NOTE]\n> 这是一个提示块。\n>\n> 第二段内容。",
    notes: "当前 Lute 打开 SetCallout，先记录为可渲染基线。",
  },
  {
    id: "hard-break",
    title: "硬换行",
    classification: "native",
    syntax: ["hard-break", "gfm"],
    markdown: "第一行  \n第二行\n\n第三行\\\n第四行",
    notes: "需要保持可见换行与 Markdown 回写语义。",
  },
  {
    id: "task-list",
    title: "任务列表",
    classification: "native",
    syntax: ["task", "unordered-list", "gfm"],
    markdown: "- [x] 已完成\n- [ ] 待处理\n  - [X] 子任务",
    notes: "点击复选框后 checked 属性必须写回 Markdown。",
  },
  {
    id: "table-basic",
    title: "基础表格",
    classification: "native",
    syntax: ["table", "gfm"],
    markdown: "| 名称 | 状态 |\n| --- | :---: |\n| 编辑器 | 进行中 |\n| 保存 | 已验证 |",
    notes: "表格是 P1 日常编辑对象。",
  },
  {
    id: "table-hard-break",
    title: "表格单元格硬换行",
    classification: "native",
    syntax: ["table", "hard-break", "html"],
    markdown: "| 列 | 内容 |\n| --- | --- |\n| A | 第一行<br>第二行 |\n| B | 一个  \n换行 |",
    notes: "验证 `<br>` 不被错误转义。",
  },
  {
    id: "image-local",
    title: "本地图片",
    classification: "native",
    syntax: ["image-local", "image"],
    markdown: "![本地图片](File/assets/local.png)",
    notes: "保留本地相对路径。",
  },
  {
    id: "image-hosted",
    title: "图床图片",
    classification: "normalize",
    syntax: ["image-hosted", "image-remote", "image"],
    markdown: "![图床图片](https://cdn.example.com/hosted.png \"mk-hosted|https://cdn.example.com/hosted.png\")",
    notes: "协议、图床地址与本地备份语义需要正式节点属性。",
  },
  {
    id: "image-doodled",
    title: "涂鸦图片",
    classification: "normalize",
    syntax: ["image-doodled", "image-local", "image"],
    markdown: "![涂鸦](File/assets/original.png \"mk-doodled|https://cdn.example.com/doodle.png\")",
    notes: "保留 original local、hosted 和 doodled 关系。",
  },
  {
    id: "image-width",
    title: "带宽度图片",
    classification: "normalize",
    syntax: ["image-width", "image-local", "image"],
    markdown: "![宽图](File/assets/wide.png \"w:640px\")",
    notes: "宽度不是普通 DOM style，应进入图片节点属性。",
  },
  {
    id: "image-data",
    title: "Data 图片",
    classification: "native",
    syntax: ["image-data", "image"],
    markdown: "![内嵌图](data:image/png;base64,iVBORw0KGgo=)",
    notes: "需要验证安全边界和包体影响。",
  },
  {
    id: "image-remote",
    title: "远程图片",
    classification: "normalize",
    syntax: ["image-remote", "image"],
    markdown: "![远程](https://images.example.com/photo.png \"远程标题\")",
    notes: "仅允许白名单协议，并保留 alt/title。",
  },
  {
    id: "image-missing",
    title: "缺失本地图片",
    classification: "native",
    syntax: ["image-missing", "image-local", "image"],
    markdown: "![尚未下载](File/assets/not-found.png)",
    notes: "文件不存在不能导致正文丢失。",
  },
  {
    id: "unsafe-html",
    title: "恶意 HTML",
    classification: "safe-source",
    syntax: ["html", "security"],
    markdown: "<img src=x onerror=alert(1)><script>alert(2)</script>",
    notes: "不得执行脚本；不能以静默删除冒充保真。",
  },
  {
    id: "unsafe-url",
    title: "恶意链接协议",
    classification: "safe-source",
    syntax: ["gfm", "security", "url"],
    markdown: "[危险链接](javascript:alert(1))\n\n[数据链接](data:text/html,<script>alert(1)</script>)",
    notes: "协议清洗和原文安全回退需要分开记录。",
  },
  {
    id: "code-block",
    title: "代码块",
    classification: "native",
    syntax: ["gfm", "code-block"],
    markdown: "```ts\nconst answer = 42;\n```",
    notes: "代码块可视化显示，编辑增强属于 P2。",
  },
  {
    id: "inline-math",
    title: "行内数学",
    classification: "normalize",
    syntax: ["math", "unknown-inline"],
    markdown: "能量公式 $E=mc^2$ 保留在正文中。",
    notes: "数学增强不阻塞 P0/P1，但序列化边界待定。",
  },
  {
    id: "nested-ordered-list",
    title: "嵌套有序列表",
    classification: "native",
    syntax: ["ordered-list", "nested-list"],
    markdown: "1. 准备\n   1. 备份\n   2. 验证\n2. 执行",
    notes: "Enter、Backspace、Tab 语义需要单独事务测试。",
  },
  {
    id: "unicode-content",
    title: "中英文与 emoji",
    classification: "native",
    syntax: ["gfm", "unicode", "ime"],
    markdown: "中文输入、English、emoji 🚀 和全角标点：，。；！",
    notes: "仅作为语料，真实 IME 仍需 Windows 实机证据。",
  },
];

const GENERATED_FIXTURES: VisualEditorFixture[] = Array.from({ length: 100 }, (_, index) => {
  const number = String(index + 1).padStart(3, "0");
  const family = index % 5;
  const classification: VisualEditorClassification = family === 0 ? "normalize" : "native";
  const markdownByFamily = [
    `合成样例 ${number}\n============\n\n- 规范化标题\n- 规范化列表\n\n| index | text |\n| --- | --- |\n| ${index} | deterministic |`,
    `# 合成任务 ${number}\n\n- [ ] 待处理 ${number}\n- [x] 已完成 ${number}\n\n> 记录来自固定合成语料。`,
    `# 合成硬换行 ${number}\n\n第一行  \n第二行\n\n\`\`\`text\nrow-${number}\n\`\`\``,
    `# 合成图片 ${number}\n\n![asset-${number}](File/assets/fixture-${number}.png)\n\n[参考链接](https://example.com/${number})`,
    `> [!TIP]\n> 合成提示 ${number}\n>\n> **可编辑**、*可撤销*、\`可复制\`。`,
  ] as const;

  return {
    id: `synthetic-${number}`,
    title: `合成兼容样例 ${number}`,
    classification,
    syntax: ["gfm", "synthetic", family === 0 ? "setext" : "paragraph"],
    markdown: markdownByFamily[family],
    notes: "由固定种子生成，禁止依赖真实用户笔记。",
  };
});

export const VISUAL_EDITOR_FIXTURES: VisualEditorFixture[] = [
  ...CORE_FIXTURES,
  ...GENERATED_FIXTURES,
];
