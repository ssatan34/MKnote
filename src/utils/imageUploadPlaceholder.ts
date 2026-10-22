const UPLOADING_IMAGE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export const UPLOADING_IMAGE_PREFIX = "mk-uploading|";

export function createUploadingImageId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `upload-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function createUploadingImageRef(uploadId: string): string {
  const normalizedId = uploadId.trim();
  if (!UPLOADING_IMAGE_ID_PATTERN.test(normalizedId)) {
    throw new Error("图片上传标识无效");
  }
  return `${UPLOADING_IMAGE_PREFIX}${normalizedId}`;
}

export function getUploadingImageId(source: string): string | null {
  const normalizedSource = source.trim();
  if (!normalizedSource.startsWith(UPLOADING_IMAGE_PREFIX)) return null;
  const uploadId = normalizedSource.slice(UPLOADING_IMAGE_PREFIX.length);
  return UPLOADING_IMAGE_ID_PATTERN.test(uploadId) ? uploadId : null;
}

export function isUploadingImageSource(source: string): boolean {
  return getUploadingImageId(source) !== null;
}

export function createUploadingImageMarkdown(uploadId: string, alt = "图片"): string {
  return `![${alt}](${createUploadingImageRef(uploadId)})`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function uploadingImagePattern(uploadId: string): RegExp {
  const marker = escapeRegExp(createUploadingImageRef(uploadId));
  return new RegExp(
    `!\\[([^\\]]*)\\]\\(\\s*${marker}(?:\\s+(?:"[^"]*"|'[^']*'))?\\s*\\)`,
    "g",
  );
}

export function replaceUploadingImageMarkdown(
  markdown: string,
  uploadId: string,
  hostedUrl: string,
): string {
  const normalizedUrl = hostedUrl.trim();
  if (!normalizedUrl) return markdown;
  return markdown.replace(
    uploadingImagePattern(uploadId),
    (_match, alt: string) =>
      `![${alt}](${normalizedUrl} "mk-hosted|${normalizedUrl}")`,
  );
}

export function removeUploadingImageMarkdown(markdown: string, uploadId: string): string {
  return markdown.replace(uploadingImagePattern(uploadId), "");
}

/**
 * 将当前图片引用替换为新的图床 URL，并把本地备用路径降级为远程标记。
 * 云图涂鸦结果只应写回 Markdown，不应因为编辑动作重新生成本地资源。
 */
export function replaceHostedImageMarkdown(
  markdown: string,
  sourceHostedUrl: string,
  localRel: string | null,
  hostedUrl: string,
): string {
  const normalizedSourceUrl = sourceHostedUrl.trim();
  const normalizedHostedUrl = hostedUrl.trim();
  if (!normalizedSourceUrl || !normalizedHostedUrl) return markdown;

  const candidates = [normalizedSourceUrl, localRel?.trim() ?? ""].filter(
    (candidate, index, values) => candidate && values.indexOf(candidate) === index,
  );
  for (const candidate of candidates) {
    const escapedCandidate = escapeRegExp(candidate);
    const pattern = new RegExp(
      `!\\[([^\\]]*)\\]\\(\\s*${escapedCandidate}(?:\\s+(?:"[^"]*"|'[^']*'))?\\s*\\)`,
    );
    const next = markdown.replace(
      pattern,
      (_match, alt: string) => `![${alt}](${normalizedHostedUrl} "mk-hosted|${normalizedHostedUrl}")`,
    );
    if (next !== markdown) return next;
  }
  return markdown;
}
