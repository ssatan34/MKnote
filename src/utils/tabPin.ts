import type { NoteTab, NoteZone, OpenTabRef } from "../types";
import { tabKey, tabsEqual } from "./noteTabs";

export const MAX_PINNED_TABS = 2;

export function tabRefKey(ref: { zone: NoteZone; name: string }): string {
  return tabKey(ref.zone, ref.name);
}

export function isTabPinned(pinned: OpenTabRef[], zone: NoteZone, name: string): boolean {
  return pinned.some((p) => p.zone === zone && p.name === name);
}

export function orderTabsByPinned(tabs: NoteTab[], pinned: OpenTabRef[]): NoteTab[] {
  if (!pinned.length) return tabs;
  const pinnedKeys = new Set(pinned.map(tabRefKey));
  const pinnedTabs: NoteTab[] = [];
  for (const ref of pinned) {
    const tab = tabs.find((t) => tabsEqual(t, ref.zone as NoteZone, ref.name));
    if (tab) pinnedTabs.push(tab);
  }
  const rest = tabs.filter((t) => !pinnedKeys.has(tabKey(t.zone, t.name)));
  return [...pinnedTabs, ...rest];
}

export function prunePinnedTabs(pinned: OpenTabRef[], openTabs: NoteTab[]): OpenTabRef[] {
  return pinned.filter((p) =>
    openTabs.some((t) => tabsEqual(t, p.zone as NoteZone, p.name)),
  );
}
