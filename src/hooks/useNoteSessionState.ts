import { useEffect, useRef, useState } from "react";
import type { NoteZone } from "../types";

export type SaveStatus = "idle" | "saving" | "saved" | "error";
export type ViewMode = "edit" | "preview";

export interface NoteSessionStateOptions {
  defaultZone: NoteZone;
}

export function useNoteSessionState({ defaultZone }: NoteSessionStateOptions) {
  const [activeNote, setActiveNote] = useState<string | null>(null);
  const [activeZone, setActiveZone] = useState<NoteZone>(defaultZone);
  const [activeNoteColor, setActiveNoteColor] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [viewMode, setViewMode] = useState<ViewMode>("preview");
  const [contentRevision, setContentRevision] = useState(0);

  const contentRef = useRef(content);
  const activeNoteRef = useRef(activeNote);
  const activeZoneRef = useRef(activeZone);
  const dirtyRef = useRef(dirty);
  const viewModeRef = useRef<ViewMode>(viewMode);

  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  useEffect(() => {
    activeNoteRef.current = activeNote;
  }, [activeNote]);

  useEffect(() => {
    activeZoneRef.current = activeZone;
  }, [activeZone]);

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  useEffect(() => {
    viewModeRef.current = viewMode;
  }, [viewMode]);

  return {
    activeNote,
    setActiveNote,
    activeZone,
    setActiveZone,
    activeNoteColor,
    setActiveNoteColor,
    content,
    setContent,
    dirty,
    setDirty,
    saveStatus,
    setSaveStatus,
    viewMode,
    setViewMode,
    contentRevision,
    setContentRevision,
    contentRef,
    activeNoteRef,
    activeZoneRef,
    dirtyRef,
    viewModeRef,
  };
}
