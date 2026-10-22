export const VISUAL_WIKILINK_NODE_TYPE = "mknote_wikilink";

export interface VisualWikilink {
  target: string;
  alias: string;
  source: string;
}

export type VisualWikilinkTextPart =
  | { kind: "text"; value: string }
  | { kind: "wikilink"; link: VisualWikilink };

const WIKILINK_PATTERN = /^\[\[([^\]\r\n|]+)(?:\|([^\]\]\r\n]+))?\]\]$/;
const WIKILINK_TEXT_PATTERN = /\[\[([^\]\r\n|]+)(?:\|([^\]\]\r\n]+))?\]\]/g;

export function parseVisualWikilink(source: string): VisualWikilink | null {
  const match = WIKILINK_PATTERN.exec(source);
  if (!match) return null;

  const target = match[1].trim();
  const alias = (match[2] ?? "").trim();
  if (!target) return null;

  return { target, alias, source };
}

export function formatVisualWikilink(link: Pick<VisualWikilink, "target" | "alias">): string {
  const target = link.target.trim();
  const alias = link.alias.trim();
  if (!target) return "";
  return `[[${target}${alias ? `|${alias}` : ""}]]`;
}

export function splitVisualWikilinkText(value: string): VisualWikilinkTextPart[] {
  const parts: VisualWikilinkTextPart[] = [];
  let cursor = 0;

  for (const match of value.matchAll(WIKILINK_TEXT_PATTERN)) {
    const source = match[0];
    const link = parseVisualWikilink(source);
    if (!link || match.index === undefined) continue;

    if (match.index > cursor) {
      parts.push({ kind: "text", value: value.slice(cursor, match.index) });
    }
    parts.push({ kind: "wikilink", link });
    cursor = match.index + source.length;
  }

  if (cursor < value.length || parts.length === 0) {
    parts.push({ kind: "text", value: value.slice(cursor) });
  }

  return parts;
}
