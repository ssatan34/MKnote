/** Keep readable tab widths and stored order; reserve a slot for the overflow menu. */
export function fitPinnedTabs(
  widths: number[],
  availableWidth: number,
  activeIndex: number,
  moreWidth = 72,
  gap = 4,
): number[] {
  const totalWidth = widths.reduce((sum, width) => sum + width, 0) + Math.max(0, widths.length - 1) * gap;
  if (totalWidth <= availableWidth) return widths.map((_, index) => index);
  const budget = Math.max(0, availableWidth - moreWidth - gap);
  const visible: number[] = [];
  let used = 0;
  for (let index = 0; index < widths.length; index += 1) {
    const next = widths[index] + (visible.length ? gap : 0);
    if (used + next > budget) break;
    visible.push(index);
    used += next;
  }
  // Selecting a hidden note reveals it without changing the saved pin order.
  if (activeIndex >= 0 && activeIndex < widths.length && !visible.includes(activeIndex)) {
    while (visible.length && used + gap + widths[activeIndex] > budget) {
      const removed = visible.pop()!;
      used -= widths[removed] + (visible.length ? gap : 0);
    }
    if (widths[activeIndex] <= budget) visible.push(activeIndex);
  }
  return visible.sort((a, b) => a - b);
}
