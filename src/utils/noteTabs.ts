import type { NoteTab, NoteZone, OpenTabRef } from "../types";

export function tabKey(zone: NoteZone, name: string): string {
  return `${zone}\u0000${name}`;
}

export function parseTabKey(key: string): { zone: NoteZone; name: string } {
  const i = key.indexOf("\u0000");
  if (i < 0) return { zone: "default", name: key };
  return { zone: key.slice(0, i) as NoteZone, name: key.slice(i + 1) };
}

export function tabsEqual(a: NoteTab, zone: NoteZone, name: string): boolean {
  return a.zone === zone && a.name === name;
}

export function openTabRefsFromTabs(tabs: NoteTab[]): OpenTabRef[] {
  return tabs.map((t) => ({ zone: t.zone, name: t.name }));
}

export function titleFromName(name: string): string {
  return name.replace(/\.md$/i, "");
}

/**
 * 返回拖拽排序后的新数组，不修改当前 Tab 列表。
 * dnd-kit 的 active/over 只负责提供稳定 key，真正的顺序变更集中在这里处理。
 */
