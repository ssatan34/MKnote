export type QuickTodoTag = "important" | "waiting" | "next" | "idea" | "urgent" | "important_urgent";

export interface QuickTodoLink {
  zone: string;
  name: string;
}

export interface QuickTodoNoteTarget extends QuickTodoLink {
  title: string;
  zoneLabel: string;
}

export interface QuickTodoCapsuleAnchor {
  x: number;
  y: number;
}

export function buildQuickTodoPopoutArgs(
  link: QuickTodoLink,
  target: QuickTodoNoteTarget | undefined,
  anchor: QuickTodoCapsuleAnchor,
) {
  return {
    zone: link.zone,
    name: link.name,
    title: target?.title || link.name.replace(/\.md$/i, ""),
    width: 400,
    height: 300,
    x: anchor.x,
    y: anchor.y,
    useCursorPosition: false,
  };
}

export function searchQuickTodoNoteTargets(targets: QuickTodoNoteTarget[], query: string): QuickTodoNoteTarget[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return [];
  return targets
    .filter((target) => `${target.title} ${target.name}`.toLocaleLowerCase().includes(normalized))
    .sort((left, right) => {
      const leftExact = left.title.toLocaleLowerCase() === normalized ? 0 : 1;
      const rightExact = right.title.toLocaleLowerCase() === normalized ? 0 : 1;
      if (leftExact !== rightExact) return leftExact - rightExact;
      return `${left.zoneLabel}${left.name}`.localeCompare(`${right.zoneLabel}${right.name}`, "zh-CN");
    });
}

export interface QuickTodoItem {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string;
  completedAt: string | null;
  tag: QuickTodoTag | null;
  parentId?: string | null;
  remindAt: string | null;
  link?: QuickTodoLink | null;
  allnoteWork?: { v: number; projectId: string; projectName: string; projectUri: string; sourceUri: string; dates: string[]; context: boolean } | null;
}

export function isAllnoteWorkTodo(item: QuickTodoItem): boolean { return item.id.startsWith("allnote_work_"); }

/** 只有仍然对应当前请求序号的异步结果才可以更新 Todo 列表。 */
export function isLatestQuickTodoRequest(requestVersion: number, currentVersion: number): boolean {
  return requestVersion === currentVersion;
}

/** 写操作必须按用户触发顺序落盘，避免删除/新建等连续操作交叉执行。 */
export function createQuickTodoMutationQueue() {
  let tail: Promise<void> = Promise.resolve();
  return function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = tail.catch(() => undefined).then(operation);
    tail = result.then(() => undefined, () => undefined);
    return result;
  };
}

export function pendingCount(items: QuickTodoItem[]): number {
  return items.filter((item) => !item.completed && !item.allnoteWork?.context).length;
}

export function filterQuickTodoItems(items: QuickTodoItem[], tag: QuickTodoTag | null): QuickTodoItem[] {
  return tag ? items.filter((item) => item.tag === tag) : items;
}
