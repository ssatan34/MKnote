import type { QuickTodoItem } from './quickTodoModel';

export interface WorkGroup { id: string; name: string; items: QuickTodoItem[]; rows: { item: QuickTodoItem; depth: number }[]; pending: number; }
export function quickWorkGroups(items: QuickTodoItem[]): WorkGroup[] {
  const groups = new Map<string, WorkGroup>();
  for (const item of items.filter(item => item.id.startsWith('allnote_work_'))) {
    const id = item.allnoteWork?.projectId ?? 'legacy';
    let group = groups.get(id);
    if (!group) { group = { id, name: item.allnoteWork?.projectName ?? 'Allnote 同步任务', items: [], rows: [], pending: 0 }; groups.set(id, group); }
    group.items.push(item);
    if (!item.completed && !item.allnoteWork?.context) group.pending++;
  }
  for (const group of groups.values()) {
    const ids = new Set(group.items.map(item => item.id)); const emitted = new Set<string>();
    const visit = (item: QuickTodoItem, depth: number): void => {
      if (emitted.has(item.id)) return;
      emitted.add(item.id); group.rows.push({ item, depth });
      for (const child of group.items.filter(child => child.parentId === item.id)) visit(child, depth + 1);
    };
    for (const item of group.items) if (!item.parentId || !ids.has(item.parentId)) visit(item, 0);
    for (const item of group.items) visit(item, 0);
  }
  return [...groups.values()];
}
