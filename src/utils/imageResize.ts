export function attachImageResize(
  img: HTMLImageElement,
  handle: HTMLElement,
  onWidthChange: (widthPx: number) => void,
) {
  const onPointerDown = (e: PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    handle.setPointerCapture(e.pointerId);

    const startX = e.clientX;
    const startWidth = img.getBoundingClientRect().width;
    const minWidth = 48;

    const onMove = (ev: PointerEvent) => {
      const delta = ev.clientX - startX;
      const next = Math.max(minWidth, Math.round(startWidth + delta));
      img.style.width = `${next}px`;
      img.style.maxWidth = "100%";
      img.style.height = "auto";
      img.setAttribute("data-mk-width", String(next));
    };

    const onUp = (ev: PointerEvent) => {
      handle.releasePointerCapture(ev.pointerId);
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
      const width = Math.round(img.getBoundingClientRect().width);
      onWidthChange(width);
    };

    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  };

  handle.addEventListener("pointerdown", onPointerDown);
}
