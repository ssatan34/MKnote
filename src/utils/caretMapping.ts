import type { CaretRange } from "./editorCaret";
import { renderMarkdownPlainText } from "./previewMarkdown";

export interface CaretAnchor {
  md: CaretRange;
  plain: CaretRange;
}

const plainTableCache = new Map<string, number[]>();

function cacheKey(md: string): string {
  return `${md.length}:${md}`;
}

/** 跳过从 i 开始的 Markdown 语法（不推进 plain 偏移） */
function skipMarkdownSyntax(md: string, i: number): number {
  const rest = md.slice(i);

  if (rest.startsWith("```")) {
    const end = md.indexOf("```", i + 3);
    return end >= 0 ? end + 3 - i : rest.length;
  }

  if (rest.startsWith("![")) {
    const close = rest.indexOf(")");
    return close >= 0 ? close + 1 : 1;
  }

  if (rest.startsWith("[")) {
    const close = rest.indexOf(")");
    return close >= 0 ? close + 1 : 1;
  }

  if (rest.startsWith("**") || rest.startsWith("__")) return 2;
  if (rest.startsWith("==")) return 2;
  if (rest.startsWith("~~")) return 2;

  if (rest[0] === "`") {
    const end = md.indexOf("`", i + 1);
    return end >= 0 ? end + 1 - i : 1;
  }

  if (rest[0] === "#") {
    let len = 0;
    while (len < rest.length && rest[len] === "#") len++;
    if (rest[len] === " ") return len + 1;
    return 1;
  }

  if (rest.startsWith("> ")) return 2;
  if (rest.startsWith("- ") || rest.startsWith("* ") || rest.startsWith("+ ")) return 2;
  if (/^\d+\.\s/.test(rest)) {
    const m = rest.match(/^\d+\.\s/);
    return m ? m[0].length : 1;
  }

  if (rest[0] === "*" || rest[0] === "_" || rest[0] === "~") return 1;

  return 0;
}

/** 基于整篇渲染纯文本，用双指针对齐 md 与 plain */
function buildPlainAtMdTable(md: string, fullPlain: string): number[] {
  const table = new Array<number>(md.length + 1).fill(0);
  let pi = 0;
  let i = 0;

  while (i < md.length) {
    table[i] = pi;

    const skip = skipMarkdownSyntax(md, i);
    if (skip > 0) {
      for (let j = 1; j < skip && i + j < md.length; j++) {
        table[i + j] = pi;
      }
      i += skip;
      continue;
    }

    const ch = md[i]!;
    if (pi < fullPlain.length && ch === fullPlain[pi]) {
      pi++;
    } else if (ch === "\n" && pi < fullPlain.length && fullPlain[pi] === "\n") {
      pi++;
    } else if (ch === "\r") {
      // 忽略单独 \r
    }
    i++;
  }

  table[md.length] = fullPlain.length;

  let last = 0;
  for (let j = 0; j <= md.length; j++) {
    table[j] = Math.max(last, Math.min(table[j]!, fullPlain.length));
    last = table[j]!;
  }

  return table;
}

async function getPlainAtMdTable(md: string): Promise<number[]> {
  const key = cacheKey(md);
  const cached = plainTableCache.get(key);
  if (cached) return cached;

  const fullPlain = await renderMarkdownPlainText(md);
  const table = buildPlainAtMdTable(md, fullPlain);

  if (plainTableCache.size > 24) plainTableCache.clear();
  plainTableCache.set(key, table);
  return table;
}

function plainToMdWithPrefer(table: number[], plainOffset: number, preferMd = 0): number {
  if (plainOffset <= 0) return 0;
  const maxMd = table.length - 1;
  if (plainOffset >= table[maxMd]!) return maxMd;

  let lo = 0;
  let hi = maxMd;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (table[mid]! < plainOffset) lo = mid + 1;
    else hi = mid;
  }

  let best = lo;
  let bestDist = Math.abs(lo - preferMd);
  for (const candidate of [lo - 1, lo, lo + 1]) {
    if (candidate < 0 || candidate > maxMd) continue;
    const plain = table[candidate]!;
    const nextPlain = table[Math.min(candidate + 1, maxMd)]!;
    if (plain <= plainOffset && (candidate === maxMd || nextPlain > plainOffset || plain === plainOffset)) {
      const dist = Math.abs(candidate - preferMd);
      if (dist < bestDist) {
        bestDist = dist;
        best = candidate;
      }
    }
  }
  return best;
}

function sameCaret(a: CaretRange, b: CaretRange): boolean {
  return a.start === b.start && a.end === b.end;
}

export async function mapMarkdownCaretToPreview(
  md: string,
  caret: CaretRange,
  anchor?: CaretAnchor | null,
): Promise<CaretRange> {
  if (anchor && sameCaret(caret, anchor.md)) return anchor.plain;
  const table = await getPlainAtMdTable(md);
  return {
    start: table[caret.start] ?? 0,
    end: table[caret.end] ?? 0,
  };
}

export async function mapPreviewCaretToMarkdown(
  md: string,
  caret: CaretRange,
  anchor?: CaretAnchor | null,
): Promise<CaretRange> {
  if (anchor && sameCaret(caret, anchor.plain)) return anchor.md;
  const table = await getPlainAtMdTable(md);
  const start = plainToMdWithPrefer(table, caret.start, anchor?.md.start ?? 0);
  const end = plainToMdWithPrefer(table, caret.end, anchor?.md.end ?? start);
  return { start, end: Math.max(start, end) };
}

export function invalidateCaretMappingCache(): void {
  plainTableCache.clear();
}
