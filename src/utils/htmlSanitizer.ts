/** 回写 Markdown 前规范化 contentEditable 产生的 HTML */
export function sanitizeEditableHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html || "<div></div>", "text/html");
  const body = doc.body;

  // 移除空块与仅含 br 的块
  body.querySelectorAll("div, p, span").forEach((el) => {
    const text = (el.textContent ?? "").replace(/\u00a0/g, " ").trim();
    const onlyBr =
      el.childNodes.length === 1 &&
      el.firstChild?.nodeName === "BR";
    if (!text && (onlyBr || el.childNodes.length === 0)) {
      el.remove();
    }
  });

  // 表格滚动容器必须保留为 div；其他普通 div 统一为 p，便于 Lute 反向解析。
  body.querySelectorAll("div").forEach((div) => {
    if (div.closest("pre, code, li") || div.querySelector("table")) return;
    const p = doc.createElement("p");
    while (div.firstChild) p.appendChild(div.firstChild);
    div.replaceWith(p);
  });

  // 移除 style / class 属性（保留图片框架与 data-mk-*）
  body.querySelectorAll("[style], [class]").forEach((el) => {
    if (el instanceof HTMLImageElement && el.hasAttribute("data-mk-rel")) {
      const width = el.getAttribute("data-mk-width");
      el.removeAttribute("style");
      if (width) {
        el.style.width = `${width}px`;
        el.style.maxWidth = "100%";
        el.style.height = "auto";
      }
      return;
    }
    if (el.tagName === "FIGURE" && el.classList.contains("mk-image-frame")) return;
    if (el.tagName === "DIV" && el.classList.contains("mk-table-wrap")) return;
    el.removeAttribute("style");
    el.removeAttribute("class");
  });

  body.querySelectorAll("img[data-mk-rel]").forEach((el) => {
    if (el instanceof HTMLImageElement) {
      const rel = el.getAttribute("data-mk-rel");
      const width = el.getAttribute("data-mk-width");
      const alt = el.getAttribute("alt");
      if (rel) el.setAttribute("data-mk-rel", rel);
      if (width) el.setAttribute("data-mk-width", width);
      if (alt) el.setAttribute("alt", alt);
    }
  });

  // 合并连续 br
  let out = body.innerHTML;
  out = out.replace(/(<br\s*\/?>\s*){3,}/gi, "<br><br>");
  return out.trim() || "<p></p>";
}
