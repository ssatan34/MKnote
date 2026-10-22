import {
  protectSourceSpans,
  type SourceSpan,
} from "./sourceAwareMarkdown.ts";

export type VisualEditorSourceBoundaryKind = "raw" | "safe-source";

export interface VisualEditorSourceBoundary {
  kind: VisualEditorSourceBoundaryKind;
  sourceKinds: string[];
  message: string;
}

// Wikilink 已由 Visual Editor 专用节点接管，不能因为 source-aware 也能识别它
// 就把普通的双链笔记错误地降级到源码模式。
const VISUAL_NATIVE_SOURCE_KINDS = new Set(["wikilink"]);
const SAFE_SOURCE_KINDS = new Set([
  "footnote-definition",
  "footnote-reference",
  "unsafe-html",
  "unsafe-url",
]);

function uniqueSourceKinds(spans: SourceSpan[]): string[] {
  return [...new Set(spans.map((span) => span.kind))];
}

function createBoundary(spans: SourceSpan[]): VisualEditorSourceBoundary {
  const sourceKinds = uniqueSourceKinds(spans);
  const kind = sourceKinds.some((sourceKind) => SAFE_SOURCE_KINDS.has(sourceKind))
    ? "safe-source"
    : "raw";

  return {
    kind,
    sourceKinds,
    message:
      kind === "safe-source"
        ? "当前笔记包含无法安全可视化编辑的内容，已保留原文，请使用源码编辑。"
        : "当前笔记包含暂不支持可视化编辑的原始 Markdown，已保留原文，请使用源码编辑。",
  };
}

/**
 * 判断一份 Markdown 是否可以安全交给可写 ProseMirror 文档。
 * 未被专用节点接管的原子 source span 不进入可写 Visual Editor，避免
 * 普通 serializer 在加载或保存时静默改写用户原文。
 */
export function inspectVisualEditorSourceBoundary(
  markdown: string,
): VisualEditorSourceBoundary | null {
  try {
    const protectedDocument = protectSourceSpans(markdown);
    const unsupportedSpans = protectedDocument.spans.filter(
      (span) => !VISUAL_NATIVE_SOURCE_KINDS.has(span.kind),
    );
    return unsupportedSpans.length > 0 ? createBoundary(unsupportedSpans) : null;
  } catch {
    return {
      kind: "safe-source",
      sourceKinds: ["malformed-source"],
      message: "当前笔记包含未闭合或无法安全解析的 Markdown，已保留原文，请使用源码编辑。",
    };
  }
}
