import { luteMarkdownToHtml } from "./luteMarkdown.ts";

export function renderMarkdownHtml(md: string): string {
  return luteMarkdownToHtml(md);
}
