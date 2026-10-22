export interface VisualTextNode {
  from: number;
  text: string;
}

export interface VisualSearchRange {
  from: number;
  to: number;
}

export function findVisualTextRanges(
  nodes: readonly VisualTextNode[],
  query: string,
): VisualSearchRange[] {
  if (!query) return [];

  const ranges: VisualSearchRange[] = [];
  for (const node of nodes) {
    let offset = node.text.indexOf(query);
    while (offset >= 0) {
      ranges.push({ from: node.from + offset, to: node.from + offset + query.length });
      offset = node.text.indexOf(query, offset + query.length);
    }
  }
  return ranges;
}

export function selectNextVisualRange(
  ranges: readonly VisualSearchRange[],
  selection: VisualSearchRange,
): VisualSearchRange | null {
  if (ranges.length === 0) return null;
  return ranges.find((range) => range.from > selection.to) ?? ranges[0];
}
