export type AiAction = "polish" | "summarize" | "translate" | "continue";

export type AiSelectionContext = {
  text: string;
  start: number;
  end: number;
  anchor?: {
    left: number;
    top: number;
    bottom: number;
  };
};

export function mergeAiResult(
  content: string,
  selection: AiSelectionContext,
  result: string,
  action: AiAction,
): string {
  const { start, end } = selection;
  if (action === "continue") {
    return content.slice(0, end) + result + content.slice(end);
  }
  return content.slice(0, start) + result + content.slice(end);
}

export function findSelectionInContent(
  content: string,
  selectedText: string,
): AiSelectionContext | null {
  const text = selectedText.trim();
  if (!text) return null;
  const start = content.indexOf(text);
  if (start === -1) return null;
  return { text, start, end: start + text.length };
}
