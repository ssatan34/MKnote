export interface VirtualizedBlockRange {
  start: number;
  end: number;
}

export interface BenchmarkDomVirtualizationOptions {
  windowSize?: number;
  anchorIndex?: number;
}

export interface BenchmarkDomVirtualizationSnapshot
  extends VirtualizedBlockRange {
  total: number;
  visible: number;
  hidden: number;
}

export interface BenchmarkDomVirtualizationController {
  update(anchorIndex: number): BenchmarkDomVirtualizationSnapshot;
  snapshot(): BenchmarkDomVirtualizationSnapshot;
  restore(): void;
}

/**
 * Calculates a centered, edge-clamped block window without touching DOM state.
 * The benchmark profile uses this to keep the active render window bounded
 * while preserving the full ProseMirror document in memory.
 */
export function computeVirtualizedBlockRange(
  totalBlockCount: number,
  anchorIndex: number,
  windowSize: number,
): VirtualizedBlockRange {
  const total = Math.max(0, Math.floor(totalBlockCount));
  if (total === 0) return { start: 0, end: 0 };

  const size = Math.max(1, Math.floor(windowSize));
  const anchor = Math.min(
    total - 1,
    Math.max(0, Math.floor(anchorIndex)),
  );
  const half = Math.floor(size / 2);
  let start = Math.max(0, anchor - half);
  let end = Math.min(total, start + size);
  start = Math.max(0, end - size);

  return { start, end };
}

const findDirectChildIndex = (
  root: HTMLElement,
  target: EventTarget | null,
  blocks: readonly HTMLElement[],
): number | null => {
  if (!(target instanceof Node)) return null;

  let element: HTMLElement | null =
    target instanceof HTMLElement ? target : target.parentElement;
  while (element && element.parentElement !== root) {
    element = element.parentElement;
  }
  if (!element) return null;

  const index = blocks.indexOf(element);
  return index >= 0 ? index : null;
};

/**
 * Diagnostic-only DOM windowing for the large-document benchmark.
 *
 * ProseMirror state and all original block nodes remain in memory. Blocks
 * outside the active window are hidden from layout/paint, and focus/selection
 * events can move the window when a caller reveals a block. This is deliberately
 * not wired into the normal PoC path because scroll anchoring and editable
 * offscreen selection still need a production-grade node-view design.
 */
export function installBenchmarkDomVirtualization(
  root: HTMLElement,
  options: BenchmarkDomVirtualizationOptions = {},
): BenchmarkDomVirtualizationController {
  const blocks = Array.from(root.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement,
  );
  const windowSize = Math.max(1, Math.floor(options.windowSize ?? 24));
  const style = root.ownerDocument.createElement("style");
  const selector = ".ProseMirror.editor";
  const isRendered = (block: HTMLElement): boolean =>
    getComputedStyle(block).display !== "none" &&
    block.getClientRects().length > 0;
  let current = computeVirtualizedBlockRange(
    blocks.length,
    options.anchorIndex ?? 0,
    windowSize,
  );

  const apply = (range: VirtualizedBlockRange): BenchmarkDomVirtualizationSnapshot => {
    current = range;
    const firstHidden = range.start;
    const lastVisible = range.end;
    style.textContent = [
      `${selector} > :nth-child(-n+${firstHidden})`,
      `${selector} > :nth-child(n+${lastVisible + 1})`,
    ].join(",\n") + " { display: none !important; }";

    const visible = blocks.filter(isRendered).length;

    return {
      start: range.start,
      end: range.end,
      total: blocks.length,
      visible,
      hidden: blocks.length - visible,
    };
  };

  const update = (anchorIndex: number): BenchmarkDomVirtualizationSnapshot =>
    apply(
      computeVirtualizedBlockRange(blocks.length, anchorIndex, windowSize),
    );

  const onFocusIn = (event: FocusEvent): void => {
    const index = findDirectChildIndex(root, event.target, blocks);
    if (index !== null) update(index);
  };

  const onSelectionChange = (): void => {
    const selection = document.getSelection();
    const index = findDirectChildIndex(
      root,
      selection?.anchorNode ?? null,
      blocks,
    );
    if (index !== null) update(index);
  };

  root.addEventListener("focusin", onFocusIn);
  document.addEventListener("selectionchange", onSelectionChange);
  root.ownerDocument.head.append(style);
  const initialSnapshot = apply(current);

  return {
    update,
    snapshot: () => ({ ...initialSnapshot, ...apply(current) }),
    restore: () => {
      style.remove();
      root.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("selectionchange", onSelectionChange);
    },
  };
}
