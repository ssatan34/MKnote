/**
 * 将 checkbox 的运行时状态同步到 HTML 属性，避免经过 innerHTML/DOMParser 后丢失。
 * Turndown 的 GFM 任务列表规则会读取 input.checked，而 HTML 序列化只保留 checked 属性。
 */
export function syncTaskCheckboxAttribute(input: HTMLInputElement): void {
  input.toggleAttribute("checked", input.checked);
}
