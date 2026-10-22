import {
  getUploadingImageId,
  isUploadingImageSource,
} from "../utils/imageUploadPlaceholder.ts";

export type VisualImageSourceKind =
  | "local"
  | "hosted"
  | "doodled"
  | "remote"
  | "data"
  | "uploading";

export interface VisualImageInput {
  src: string;
  alt?: string;
  title?: string;
}

export interface VisualImageMetadata {
  src: string;
  alt: string;
  title: string;
  sourceKind: VisualImageSourceKind;
  localRel: string;
  originalLocalRel: string;
  hostedUrl: string;
  width: number;
  doodledUrl: string;
}

const SAFE_RASTER_DATA_URL =
  /^data:image\/(?:png|jpe?g|gif|webp|avif);base64,[a-z0-9+/=_-]+$/i;

function normalizeSource(source: string): string {
  return source.trim().replace(/\\/g, "/");
}

function normalizeLocalRel(source: string): string {
  const normalized = normalizeSource(source);
  if (/^asset:\/\/localhost\//i.test(normalized)) {
    return normalized.replace(/^asset:\/\/localhost\//i, "");
  }
  if (/^assets\//i.test(normalized)) return `File/${normalized}`;
  return normalized.replace(/^file\//i, "File/");
}

function isLocalSource(source: string): boolean {
  return /^(?:File\/|assets\/|asset:\/\/localhost\/)/i.test(normalizeSource(source));
}

function isHttpSource(source: string): boolean {
  return /^https?:\/\//i.test(normalizeSource(source));
}

function readWidth(title: string): number {
  const match = title.match(/^w:(\d+(?:\.\d+)?)(?:px|%)?$/i);
  if (!match) return 0;
  const width = Math.round(Number(match[1]));
  return Number.isFinite(width) && width > 0 ? width : 0;
}

function readMarker(title: string, marker: "mk-hosted" | "mk-doodled"): string {
  const prefix = `${marker}|`;
  return title.startsWith(prefix) ? title.slice(prefix.length).trim() : "";
}

export function isSafeVisualImageSource(source: string): boolean {
  const normalized = normalizeSource(source);
  if (!normalized) return false;
  if (isUploadingImageSource(normalized)) return true;
  if (isLocalSource(normalized) || isHttpSource(normalized)) return true;
  return SAFE_RASTER_DATA_URL.test(normalized);
}

export function parseVisualImageMetadata(
  src: string,
  alt = "",
  title = "",
): VisualImageMetadata {
  const normalizedSrc = normalizeSource(src);
  if (!isSafeVisualImageSource(normalizedSrc)) {
    throw new Error(`图片源不安全，visual editor 拒绝加载：${normalizedSrc}`);
  }

  const hostedMarker = readMarker(title, "mk-hosted");
  const doodledMarker = readMarker(title, "mk-doodled");
  const uploadingId = getUploadingImageId(normalizedSrc);
  if (hostedMarker && !isSafeVisualImageSource(hostedMarker)) {
    throw new Error(`图床图片源不安全，visual editor 拒绝加载：${hostedMarker}`);
  }
  if (doodledMarker && !isSafeVisualImageSource(doodledMarker)) {
    throw new Error(`涂鸦图片源不安全，visual editor 拒绝加载：${doodledMarker}`);
  }

  const localRel = isLocalSource(normalizedSrc)
    ? normalizeLocalRel(normalizedSrc)
    : hostedMarker && isLocalSource(hostedMarker)
      ? normalizeLocalRel(hostedMarker)
      : "";
  const sourceKind: VisualImageSourceKind = uploadingId
    ? "uploading"
    : doodledMarker
      ? "doodled"
      : hostedMarker
        ? "hosted"
        : isLocalSource(normalizedSrc)
          ? "local"
          : SAFE_RASTER_DATA_URL.test(normalizedSrc)
            ? "data"
            : "remote";

  return {
    src: normalizedSrc,
    alt,
    title,
    sourceKind,
    localRel,
    originalLocalRel: doodledMarker && isLocalSource(normalizedSrc) ? localRel : "",
    hostedUrl:
      hostedMarker && isHttpSource(normalizedSrc)
        ? normalizedSrc
        : hostedMarker && isHttpSource(hostedMarker)
          ? hostedMarker
          : sourceKind === "remote"
            ? normalizedSrc
            : "",
    width: readWidth(title),
    doodledUrl: doodledMarker,
  };
}

export function serializeVisualImageTitle(metadata: VisualImageMetadata): string {
  if (metadata.doodledUrl) return `mk-doodled|${metadata.doodledUrl}`;
  if (metadata.sourceKind === "hosted" && (metadata.localRel || metadata.hostedUrl)) {
    return `mk-hosted|${metadata.localRel || metadata.hostedUrl}`;
  }
  if (metadata.width > 0) return `w:${metadata.width}px`;
  return metadata.title;
}

export function serializeVisualImageSource(metadata: VisualImageMetadata): string {
  return metadata.localRel || metadata.hostedUrl || metadata.src;
}
