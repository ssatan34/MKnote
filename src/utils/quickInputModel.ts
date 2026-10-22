export function shouldSubmitInputKey(event: { key: string; shiftKey: boolean; isComposing?: boolean }): boolean {
  return event.key === "Enter" && !event.shiftKey && !event.isComposing;
}

export function shouldInsertNewline(event: { key: string; shiftKey: boolean }): boolean {
  return event.key === "Enter" && event.shiftKey;
}

