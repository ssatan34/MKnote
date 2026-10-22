import manifest from "../assets/icon-manifest.json";

const iconModules = import.meta.glob<string>(
  ["../assets/icons/*.svg", "!../assets/icons/logo.svg"],
  {
    eager: true,
    query: "?raw",
    import: "default",
  },
);

const RAW_BY_ID: Record<string, string> = {};
for (const [path, raw] of Object.entries(iconModules)) {
  const base = path.split("/").pop()?.replace(/\.svg$/, "") ?? "";
  RAW_BY_ID[base.replace(/-/g, "_")] = raw;
}

export type IconId = (typeof manifest)[number]["id"];

function formatSvg(raw: string, size: number): string {
  return raw
    .replace(/\s(width|height)="24"/g, "")
    .replace(/(fill|stroke)="#333333"/g, '$1="currentColor"')
    .replace("<svg", `<svg width="${size}" height="${size}"`);
}

/** 供 previewDom 等非 React 场景注入 HTML */
export function iconSvgHtml(name: IconId, size = 16): string {
  const raw = RAW_BY_ID[name];
  if (!raw) return "";
  return formatSvg(raw, size);
}

interface IconProps {
  name: IconId;
  size?: number;
  className?: string;
}

export function Icon({ name, size = 16, className }: IconProps) {
  const html = iconSvgHtml(name, size);
  if (!html) return null;
  return (
    <span
      className={["mk-icon", className].filter(Boolean).join(" ")}
      aria-hidden
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
