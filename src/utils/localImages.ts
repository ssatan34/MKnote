import { assetService } from "../services/assetService";
import { applyWidthToImg, parseWidthFromTitle } from "./imageMarkdown";
const LOCAL_ASSET_RE = /^(File\/)?assets\//i;
const ASSET_PROTOCOL_RE = /^asset:\/\//i;

export function isLocalAssetPath(path: string): boolean {
  const trimmed = path.trim().replace(/\\/g, "/");
  return LOCAL_ASSET_RE.test(trimmed) || trimmed.startsWith("File/assets/") || ASSET_PROTOCOL_RE.test(trimmed);
}

function normalizeAssetRel(path: string): string {
  const trimmed = path.trim().replace(/\\/g, "/");
  if (trimmed.startsWith("File/")) return trimmed;
  if (trimmed.startsWith("assets/")) return `File/${trimmed}`;
  return trimmed;
}

export async function resolveLocalAssetUrl(markdownPath: string): Promise<string> {
  const rel = normalizeAssetRel(markdownPath);
  if (!rel || rel.startsWith("http://") || rel.startsWith("https://") || rel.startsWith("data:")) {
    return rel;
  }
  if (ASSET_PROTOCOL_RE.test(rel)) {
    return rel;
  }
  return assetService.resolveDisplayUrl(rel);
}

export async function hydrateLocalImagesInHtml(html: string): Promise<string> {
  if (!html.includes("assets") && !html.includes("File/") && !html.includes("mk-hosted") && !html.includes("mk-doodled")) {
    return html;
  }
  const doc = new DOMParser().parseFromString(html, "text/html");
  const imgs = doc.querySelectorAll("img");
  await Promise.all(
    Array.from(imgs).map(async (img) => {
      const src = img.getAttribute("src") ?? "";
      const title = img.getAttribute("title") ?? "";

      // mk-doodled：src 是本地路径，直接解析本地文件显示
      if (img.getAttribute("data-mk-doodled") || title.startsWith("mk-doodled|")) {
        const localRel = normalizeAssetRel(src);
        if (localRel && localRel.startsWith("File/")) {
          try {
            const url = await assetService.resolveDisplayUrl(localRel);
            img.setAttribute("src", url);
            img.setAttribute("data-mk-rel", localRel);
            const widthPx = parseWidthFromTitle(title);
            if (widthPx) applyWidthToImg(img, widthPx);
          } catch { /* 保持原 src */ }
        }
        return;
      }

      // mk-hosted|本地路径：优先用本地文件渲染，保留云 badge
      if (title.startsWith("mk-hosted|")) {
        const localRel = title.slice("mk-hosted|".length).trim();
        if (localRel && localRel.startsWith("File/")) {
          try {
            const url = await assetService.resolveDisplayUrl(localRel);
            img.setAttribute("src", url);
            img.setAttribute("data-mk-rel", localRel);
            img.setAttribute("data-mk-hosted", "1");
            const widthPx = parseWidthFromTitle(title);
            if (widthPx) applyWidthToImg(img, widthPx);
          } catch { /* 本地文件不存在则保留图床 URL */ }
          return;
        }
      }

      // 纯本地路径图片
      if (!src || src.startsWith("http://") || src.startsWith("https://") || src.startsWith("data:")) {
        return;
      }
      const rel = normalizeAssetRel(img.getAttribute("data-mk-rel") ?? src);
      if (!isLocalAssetPath(rel)) return;
      const widthPx = parseWidthFromTitle(img.getAttribute("title"));
      try {
        const url = await assetService.resolveDisplayUrl(rel);
        img.setAttribute("src", url);
        img.setAttribute("data-mk-rel", rel);
        if (widthPx) applyWidthToImg(img, widthPx);
      } catch { /* keep original src */ }
    }),
  );
  return doc.body.innerHTML;
}

export function stripAssetProtocolFromMarkdown(md: string): string {
  return md.replace(
    /!\[([^\]]*)\]\((asset:[^)]+)\)/g,
    (_match, alt: string, src: string) => {
      const rel = src.replace(/^asset:\/\/localhost\//, "").replace(/\\/g, "/");
      return `![${alt}](${rel})`;
    },
  );
}
