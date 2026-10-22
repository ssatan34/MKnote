import { hydrateLocalImagesInHtml } from "./localImages";
import { renderMarkdownHtml } from "./markdownRenderCore";

export async function markdownToHtml(md: string): Promise<string> {
  const html = renderMarkdownHtml(md);
  return hydrateLocalImagesInHtml(html);
}

import { applyPreviewEnhancements } from "./previewDom";

function htmlToPlainText(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;
  applyPreviewEnhancements(div);
  return div.textContent ?? "";
}

/** 与 EditablePreviewEditor 一致的预览纯文本 */
export async function renderMarkdownPlainText(md: string): Promise<string> {
  const html = await markdownToHtml(md);
  return htmlToPlainText(html);
}
