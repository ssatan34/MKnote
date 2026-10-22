import { useCallback, useEffect, useRef, useState } from "react";
import { configService } from "../services/configService";
import type { AppConfig, NoteTab, NoteZone, OpenTabRef } from "../types";
import { openTabRefsFromTabs, parseTabKey, tabKey, tabsEqual } from "../utils/noteTabs";
import { isTabPinned, MAX_PINNED_TABS, orderTabsByPinned } from "../utils/tabPin";

const PERSIST_TABS_MS = 400;

interface OpenTabsControllerOptions {
  config: AppConfig | null;
  onPersistedConfig: (config: AppConfig) => void;
  onPersistError: (error: unknown) => void;
}

export function useOpenTabsController({
  config,
  onPersistedConfig,
  onPersistError,
}: OpenTabsControllerOptions) {
  const [openTabs, setOpenTabs] = useState<NoteTab[]>([]);
  const [pinnedTabs, setPinnedTabsState] = useState<OpenTabRef[]>([]);
  const openTabsRef = useRef(openTabs);
  const pinnedTabsRef = useRef(pinnedTabs);
  const pinnedTabLimitRef = useRef<number>(MAX_PINNED_TABS);
  const tabVisitOrderRef = useRef<string[]>([]);
  const persistTabsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    openTabsRef.current = openTabs;
  }, [openTabs]);

  useEffect(() => {
    pinnedTabsRef.current = pinnedTabs;
  }, [pinnedTabs]);

  useEffect(() => {
    pinnedTabLimitRef.current = config?.pinned_tab_limit ?? MAX_PINNED_TABS;
  }, [config]);

  const setPinnedTabs = useCallback((next: OpenTabRef[]) => {
    pinnedTabsRef.current = next;
    setPinnedTabsState(next);
  }, []);

  const commitOpenTabs = useCallback((next: NoteTab[]) => {
    const ordered = orderTabsByPinned(next, pinnedTabsRef.current);
    const withFlags = ordered.map((tab) => ({
      ...tab,
      pinned: isTabPinned(pinnedTabsRef.current, tab.zone, tab.name),
    }));
    openTabsRef.current = withFlags;
    setOpenTabs(withFlags);
  }, []);

  const recordTabVisit = useCallback(
    (zone: NoteZone, name: string) => {
      const key = tabKey(zone, name);
      const stack = tabVisitOrderRef.current.filter((item) => item !== key);
      stack.push(key);
      tabVisitOrderRef.current = stack;
    },
    [],
  );

  const getTabAfterClose = useCallback((closedZone: NoteZone, closedName: string): NoteTab | null => {
    const closedKey = tabKey(closedZone, closedName);
    const tabs = openTabsRef.current;
    const order = tabVisitOrderRef.current;
    for (let i = order.length - 1; i >= 0; i--) {
      const key = order[i];
      if (key === closedKey) continue;
      const { zone, name } = parseTabKey(key);
      const tab = tabs.find((candidate) => tabsEqual(candidate, zone, name));
      if (tab) return tab;
    }
    return tabs.find((tab) => !tabsEqual(tab, closedZone, closedName)) ?? null;
  }, []);

  const schedulePersistTabs = useCallback(
    (tabs: NoteTab[], zone: NoteZone, name: string) => {
      if (persistTabsTimerRef.current) clearTimeout(persistTabsTimerRef.current);
      persistTabsTimerRef.current = setTimeout(() => {
        void configService.setOpenTabs({
          tabs: openTabRefsFromTabs(tabs),
          activeZone: zone,
          activeName: name,
          pinnedTabs: pinnedTabsRef.current,
        })
          .then(onPersistedConfig)
          .catch(onPersistError);
      }, PERSIST_TABS_MS);
    },
    [onPersistError, onPersistedConfig],
  );

  const persistOpenTabsNow = useCallback(
    async (tabs: NoteTab[], zone: NoteZone, name: string) => {
      const nextConfig = await configService.setOpenTabs({
        tabs: openTabRefsFromTabs(tabs),
        activeZone: zone,
        activeName: name,
        pinnedTabs: pinnedTabsRef.current,
      });
      onPersistedConfig(nextConfig);
    },
    [onPersistedConfig],
  );

  return {
    openTabs,
    setOpenTabs,
    openTabsRef,
    pinnedTabs,
    pinnedTabsRef,
    pinnedTabLimitRef,
    tabVisitOrderRef,
    setPinnedTabs,
    commitOpenTabs,
    recordTabVisit,
    getTabAfterClose,
    schedulePersistTabs,
    persistOpenTabsNow,
  };
}
