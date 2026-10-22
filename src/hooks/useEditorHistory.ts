import { useCallback, useMemo, useRef } from "react";

const MAX = 80;

export function useEditorHistory() {
  const stackRef = useRef<string[]>([]);
  const indexRef = useRef(-1);
  const skipRef = useRef(false);

  const reset = useCallback((value: string) => {
    stackRef.current = [value];
    indexRef.current = 0;
  }, []);

  const push = useCallback((value: string) => {
    if (skipRef.current) {
      skipRef.current = false;
      return;
    }
    const stack = stackRef.current;
    const idx = indexRef.current;
    if (idx >= 0 && stack[idx] === value) return;
    const next = stack.slice(0, idx + 1);
    next.push(value);
    if (next.length > MAX) next.shift();
    stackRef.current = next;
    indexRef.current = next.length - 1;
  }, []);

  const undo = useCallback((): string | null => {
    const idx = indexRef.current;
    if (idx <= 0) return null;
    indexRef.current = idx - 1;
    skipRef.current = true;
    return stackRef.current[idx - 1] ?? null;
  }, []);

  const redo = useCallback((): string | null => {
    const stack = stackRef.current;
    const idx = indexRef.current;
    if (idx >= stack.length - 1) return null;
    indexRef.current = idx + 1;
    skipRef.current = true;
    return stack[idx + 1] ?? null;
  }, []);

  const getState = useCallback(() => ({
    stack: [...stackRef.current],
    index: indexRef.current,
  }), []);

  const loadState = useCallback((stack: string[], index: number) => {
    stackRef.current = stack.length ? [...stack] : [""];
    indexRef.current = Math.min(Math.max(index, 0), stackRef.current.length - 1);
    skipRef.current = false;
  }, []);

  return useMemo(
    () => ({ reset, push, undo, redo, getState, loadState }),
    [reset, push, undo, redo, getState, loadState],
  );
}
