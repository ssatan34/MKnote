type HighlightModule = { default: { highlightElement(node: HTMLElement): void } };

export async function highlightPreviewCode(
  nodes: Iterable<HTMLElement>,
  load: () => Promise<HighlightModule> = () => import("highlight.js"),
) {
  const blocks = Array.from(nodes);
  if (blocks.length === 0) return;
  const { default: highlighter } = await load();
  for (const node of blocks) highlighter.highlightElement(node);
}
