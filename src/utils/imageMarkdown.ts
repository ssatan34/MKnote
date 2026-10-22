/** 本地图片 Markdown：![alt](File/assets/x.png "w:320px") */

export interface ParsedImageRef {
  index: number;
  length: number;
  alt: string;
  path: string;
  widthPx?: number;
}

const IMAGE_MD_RE = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g;

export function parseWidthFromTitle(title?: string | null): number | undefined {
  if (!title) return undefined;
  const m = title.match(/^w:(\d+(?:\.\d+)?)(px|%)?$/i);
  if (!m) return undefined;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.round(n);
}

export function formatWidthTitle(widthPx: number): string {
  return `w:${Math.round(widthPx)}px`;
}

export function parseImagesFromMarkdown(md: string): ParsedImageRef[] {
  const out: ParsedImageRef[] = [];
  IMAGE_MD_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = IMAGE_MD_RE.exec(md))) {
    const path = match[2].replace(/\\/g, "/");
    if (!path.startsWith("File/assets/") && !path.startsWith("file/assets/")) continue;
    out.push({
      index: match.index,
      length: match[0].length,
      alt: match[1] || "图片",
      path: path.replace(/^file\//i, "File/"),
      widthPx: parseWidthFromTitle(match[3]),
    });
  }
  return out;
}

export function formatImageMarkdown(alt: string, path: string, widthPx?: number): string {
  const normalized = path.replace(/\\/g, "/");
  const title = widthPx && widthPx > 0 ? ` "${formatWidthTitle(widthPx)}"` : "";
  return `![${alt || "图片"}](${normalized}${title})`;
}

export function setImageWidthInMarkdown(md: string, path: string, widthPx: number): string {
  const normalized = path.replace(/\\/g, "/");
  let replaced = false;
  const next = md.replace(IMAGE_MD_RE, (full, alt: string, p: string, _title?: string) => {
    const rel = p.replace(/\\/g, "/").replace(/^file\//i, "File/");
    if (rel !== normalized) return full;
    replaced = true;
    return formatImageMarkdown(alt, rel, widthPx);
  });
  return replaced ? next : md;
}

export function replaceImagePathInMarkdown(md: string, oldPath: string, newPath: string): string {
  const oldNorm = oldPath.replace(/\\/g, "/").replace(/^file\//i, "File/");
  const newNorm = newPath.replace(/\\/g, "/").replace(/^file\//i, "File/");
  return md.replace(IMAGE_MD_RE, (full, alt: string, p: string, title?: string) => {
    const rel = p.replace(/\\/g, "/").replace(/^file\//i, "File/");
    if (rel !== oldNorm) return full;
    const width = parseWidthFromTitle(title);
    return formatImageMarkdown(alt, newNorm, width);
  });
}

export function applyWidthToImg(img: HTMLImageElement, widthPx?: number) {
  if (widthPx && widthPx > 0) {
    img.setAttribute("data-mk-width", String(Math.round(widthPx)));
    img.style.width = `${Math.round(widthPx)}px`;
    img.style.maxWidth = "100%";
    img.style.height = "auto";
  } else {
    img.removeAttribute("data-mk-width");
    img.style.width = "";
    img.style.maxWidth = "100%";
    img.style.height = "auto";
  }
}
