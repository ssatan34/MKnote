import { createLatestRequest } from "../utils/latestRequest";
import { createNoteColorRefresh } from "../utils/noteColorRefresh";
import { useCallback, useEffect, useRef, useState } from "react";
import { libraryService } from "../services/libraryService";
import { notesService } from "../services/notesService";
import { siyuanService } from "../services/siyuanService";
import type {
  CustomTagDef,
  NoteColorSummary,
  NoteFolderSummary,
  NoteSummary,
  NoteZone,
  SiyuanSyncedNoteRef,
} from "../types";

export function useLibraryData() {
  const [inboxNotes, setInboxNotes] = useState<NoteSummary[]>([]);
  const [folders, setFolders] = useState<NoteFolderSummary[]>([]);
  const [noteColors, setNoteColors] = useState<NoteColorSummary[]>([]);
  const [libraryNotes, setLibraryNotes] = useState<NoteSummary[]>([]);
  const [libraryZone, setLibraryZone] = useState<NoteZone>("default");
  const [activeColor, updateActiveColor] = useState<string | null>(null);
  const [customTags, setCustomTags] = useState<CustomTagDef[]>([]);
  const [siyuanSyncedNotes, setSiyuanSyncedNotes] = useState<SiyuanSyncedNoteRef[]>([]);

  const libraryRequest = useRef(createLatestRequest());
  const inboxRequest = useRef(createLatestRequest());
  const colorRequest = useRef(createNoteColorRefresh(() => libraryService.listNoteColors(), setNoteColors));
  const selection = useRef({ zone: libraryZone, color: activeColor });
  useEffect(() => () => {
    libraryRequest.current.invalidate();
    inboxRequest.current.invalidate();
    colorRequest.current.invalidate();
  }, []);
  const setActiveColor = useCallback((color: string | null) => {
    libraryRequest.current.invalidate();
    selection.current.color = color;
    updateActiveColor(color);
  }, []);

  const refreshNoteColors = useCallback(() => colorRequest.current.refresh(), []);

  const refreshZone = useCallback(async (zone: NoteZone) => {
    const load = () => notesService.list(zone);
    const pending = zone === "inbox"
      ? () => inboxRequest.current.run(load, setInboxNotes)
      : load;
    if (!selection.current.color && zone === selection.current.zone) {
      return libraryRequest.current.run(pending, (list) => {
        setLibraryNotes(list);
        setLibraryZone(zone);
        updateActiveColor(null);
      });
    }
    return pending();
  }, []);

  const refreshLibrary = useCallback(
    async (zone: NoteZone = selection.current.zone, color: string | null | undefined = undefined) => {
      const filterColor = color === undefined ? selection.current.color : color;
      selection.current = { zone, color: filterColor };
      const [folderList, , noteList] = await libraryRequest.current.run(
        () => Promise.all([
          libraryService.listFolders(),
          refreshNoteColors(),
          filterColor ? libraryService.listNotesByColor(filterColor) : notesService.list(zone),
        ]),
        ([nextFolders, , nextNotes]) => {
          setFolders(nextFolders);
          setLibraryNotes(nextNotes);
          setLibraryZone(zone);
          updateActiveColor(filterColor);
        },
      );
      return { folderList, notes: noteList };
    },
    [refreshNoteColors],
  );

  const refreshCustomTags = useCallback(async () => {
    const list = await libraryService.listCustomTags();
    setCustomTags(list);
    return list;
  }, []);

  const refreshSiyuanSyncedNotes = useCallback(async () => {
    const list = await siyuanService.listSyncedNotes();
    setSiyuanSyncedNotes(list);
    return list;
  }, []);

  return {
    inboxNotes,
    folders,
    noteColors,
    libraryNotes,
    libraryZone,
    activeColor,
    customTags,
    siyuanSyncedNotes,
    setActiveColor,
    refreshNoteColors,
    refreshZone,
    refreshLibrary,
    refreshCustomTags,
    refreshSiyuanSyncedNotes,
  };
}

