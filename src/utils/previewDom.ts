import { highlightPreviewCode } from "./previewHighlight";
import { iconSvgHtml } from "../components/Icon";
import { copyFeedbackIconSvg } from "../components/CopyFeedbackIcon";
import { applyWidthToImg } from "./imageMarkdown";
import { attachImageResize } from "./imageResize";

const SVG_COPY = copyFeedbackIconSvg(14);
const SVG_EXPAND = iconSvgHtml("code_expand", 14);
const SVG_COLLAPSE = iconSvgHtml("code_collapse", 14);

function headingLevel(tag: string): number {
  const n = Number(tag.charAt(1));
  return Number.isFinite(n) ? n : 6;
}

function iconBtn(svg: string, title: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "mk-code-btn";
  btn.title = title;
  btn.innerHTML = svg;
  btn.setAttribute("contenteditable", "false");
  btn.addEventListener("mousedown", (e) => e.preventDefault());
  return btn;
}

/** 标题点击折叠其下内容（直到同级或更高级标题） */
function attachHeadingCollapse(root: HTMLElement) {
  const headings = Array.from(root.querySelectorAll("h1, h2, h3, h4, h5, h6"));
  headings.forEach((heading) => {
    if (heading.classList.contains("mk-heading-toggle")) return;

    const level = headingLevel(heading.tagName);
    const section: HTMLElement[] = [];
    let node = heading.nextElementSibling;
    while (node) {
      if (/^H[1-6]$/i.test(node.tagName) && headingLevel(node.tagName) <= level) {
        break;
      }
      section.push(node as HTMLElement);
      node = node.nextElementSibling;
    }
    if (section.length === 0) return;

    heading.classList.add("mk-heading-toggle");
    heading.setAttribute("data-mk-section", "open");

    heading.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("button, input, a")) return;
      const collapsed = heading.getAttribute("data-mk-section") === "closed";
      section.forEach((el) => {
        el.style.display = collapsed ? "" : "none";
      });
      heading.setAttribute("data-mk-section", collapsed ? "open" : "closed");
      heading.classList.toggle("mk-collapsed", !collapsed);
    });
  });
}

/** 代码块：复制 + 收起/展开（图标按钮） */
function attachCodeBlockToolbar(root: HTMLElement) {
  root.querySelectorAll("pre").forEach((pre) => {
    if (pre.querySelector(".mk-code-toolbar")) return;

    const code = pre.querySelector("code");
    const toolbar = document.createElement("div");
    toolbar.className = "mk-code-toolbar";

    const copyBtn = iconBtn(SVG_COPY, "复制代码");
    copyBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const text = (code?.textContent ?? pre.textContent ?? "").trim();
      void navigator.clipboard.writeText(text).then(() => {
        copyBtn.querySelector(".copy-feedback-icon")?.classList.add("is-copied");
        copyBtn.title = "已复制";
        window.setTimeout(() => {
          copyBtn.querySelector(".copy-feedback-icon")?.classList.remove("is-copied");
          copyBtn.title = "复制代码";
        }, 1500);
      });
    });

    const collapseBtn = iconBtn(SVG_COLLAPSE, "收起代码");
    collapseBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const collapsed = pre.classList.toggle("mk-code-collapsed");
      if (code) code.style.display = collapsed ? "none" : "";
      collapseBtn.innerHTML = collapsed ? SVG_EXPAND : SVG_COLLAPSE;
      collapseBtn.title = collapsed ? "展开代码" : "收起代码";
    });

    toolbar.append(copyBtn, collapseBtn);
    pre.insertBefore(toolbar, pre.firstChild);
  });
}

export type ImageEnhancementHandlers = {
  onImageResized?: () => void;
  /** relPath 是本地路径（null 表示无本地备份）；hostedUrl 是图床 URL（若有） */
  onImageDoodle?: (relPath: string | null, hostedUrl: string | null) => void;
  /** 还原原始图片：下载图床 URL 并覆盖本地，更新 Markdown */
  onImageRestore?: (localRel: string, hostedUrl: string) => void;
};

let imageHandlers: ImageEnhancementHandlers = {};

export function setImageEnhancementHandlers(handlers: ImageEnhancementHandlers) {
  imageHandlers = handlers;
}

function wrapImageWithFrame(img: HTMLImageElement) {
  if (img.closest(".mk-image-frame")) return;

  const rel = img.getAttribute("data-mk-rel") ?? "";
  const widthAttr = img.getAttribute("data-mk-width");
  const widthPx = widthAttr ? Number(widthAttr) : undefined;
  if (widthPx && Number.isFinite(widthPx)) applyWidthToImg(img, widthPx);

  const figure = document.createElement("figure");
  figure.className = "mk-image-frame";
  figure.setAttribute("contenteditable", "false");

  const parent = img.parentNode;
  if (!parent) return;
  parent.insertBefore(figure, img);
  figure.appendChild(img);

  const handle = document.createElement("span");
  handle.className = "mk-image-resize-handle";
  handle.title = "拖拽调整宽度";
  handle.setAttribute("contenteditable", "false");
  handle.setAttribute("aria-hidden", "true");
  // 注入 resize icon SVG（从 Icon 组件的同源 SVG 取）
  handle.innerHTML = iconSvgHtml("image_resize", 14);
  figure.appendChild(handle);

  // 已上传到图床：data-mk-hosted="1" 或 title 含 mk-hosted，加云标识水印
  // title 格式可能是 "mk-hosted|File/assets/xxx.png"，提取本地路径供涂鸦使用
  const imgTitle = img.getAttribute("title") ?? "";
  const isHosted =
    img.getAttribute("data-mk-hosted") === "1" ||
    imgTitle.startsWith("mk-hosted");

  // 从 title 解析本地备用路径
  let localRel = rel;
  if (isHosted) {
    const pipeIdx = imgTitle.indexOf("|");
    if (pipeIdx !== -1) {
      const embedded = imgTitle.slice(pipeIdx + 1).trim();
      if (embedded) {
        localRel = embedded;
        img.setAttribute("data-mk-local-rel", embedded);
      }
    }
  }

  // mk-doodled：涂鸦后状态，右上角显示「还原原图」badge
  const doodledUrl = img.getAttribute("data-mk-doodled") ?? "";
  if (doodledUrl) {
    const restoreBadge = document.createElement("span");
    restoreBadge.className = "mk-image-restore-badge";
    restoreBadge.title = "还原为图床原始图片";
    restoreBadge.setAttribute("contenteditable", "false");
    restoreBadge.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" width="13" height="13">
      <path d="M3 8a5 5 0 1 0 1.5-3.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
      <path d="M3 4.5V8h3.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
    restoreBadge.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      // rel 此时是本地路径（data-mk-rel），doodledUrl 是图床原始 URL
      imageHandlers.onImageRestore?.(rel, doodledUrl);
    });
    figure.appendChild(restoreBadge);
  }

  if (isHosted) {
    const badge = document.createElement("span");
    badge.className = "mk-image-hosted-badge";
    badge.title = "图片已上传至图床";
    badge.setAttribute("contenteditable", "false");
    badge.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" width="14" height="14">
      <path d="M12.5 7.5A2.5 2.5 0 0 0 10.18 5.03 3.5 3.5 0 0 0 3.5 7a2 2 0 0 0 0 4H12.5a2.5 2.5 0 0 0 0-5z" fill="currentColor"/>
      <path d="M8 9.5V6.5m0 0-1.5 1.5M8 6.5l1.5 1.5" stroke="var(--mk-cloud-badge-arrow,#fff)" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
    figure.appendChild(badge);
  }

  img.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest(".mk-image-resize-handle")) return;
    e.preventDefault();
    e.stopPropagation();
    const imgSrc = img.getAttribute("src") ?? "";
    const currentHostedUrl = (imgSrc.startsWith("http://") || imgSrc.startsWith("https://")) ? imgSrc : null;
    // localRel 有值且是本地路径才传给涂鸦；否则传 null 让 Modal 走纯远程模式
    const doodleLocalRel = (localRel && localRel.startsWith("File/")) ? localRel : null;
    // 只有有可操作的路径（本地或远程）才打开
    if (doodleLocalRel || currentHostedUrl) {
      imageHandlers.onImageDoodle?.(doodleLocalRel, currentHostedUrl);
    }
  });

  attachImageResize(img, handle, () => {
    imageHandlers.onImageResized?.();
  });
}

function attachImageEnhancements(root: HTMLElement) {
  // 本地资产图片（data-mk-rel）和图床图片（data-mk-hosted）都需要包裹
  root.querySelectorAll("img[data-mk-rel], img[data-mk-hosted]").forEach((node) => {
    wrapImageWithFrame(node as HTMLImageElement);
  });
}

/** 预览区灌入 HTML 后：代码高亮、任务列表、折叠 */
export function applyPreviewEnhancements(root: HTMLElement) {
  // Keep all supported languages, but parse their module only for code blocks.
  // A failed optional enhancement leaves readable, unhighlighted code.
  void highlightPreviewCode(root.querySelectorAll<HTMLElement>("pre code")).catch(() => undefined);

  root.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    input.removeAttribute("disabled");
    input.setAttribute("contenteditable", "false");
    const li = input.closest("li");
    if (li) li.classList.add("task-list-item");
  });

  attachHeadingCollapse(root);
  attachCodeBlockToolbar(root);
  attachImageEnhancements(root);
}

export function isTaskCheckbox(target: EventTarget | null): target is HTMLInputElement {
  return (
    target instanceof HTMLInputElement &&
    target.type === "checkbox" &&
    target.closest(".editable-preview") !== null
  );
}
