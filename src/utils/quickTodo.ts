export function formatQuickTodoContent(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error("待办内容不能为空");
  }
  return `- [ ] ${trimmed}\n`;
}
