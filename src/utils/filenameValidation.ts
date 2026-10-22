const BAD_FILENAME_CHARS = /[\\/:*?"<>|]/;

const WINDOWS_RESERVED_NAMES = new Set([
  "CON",
  "PRN",
  "AUX",
  "NUL",
  "COM1",
  "COM2",
  "COM3",
  "COM4",
  "COM5",
  "COM6",
  "COM7",
  "COM8",
  "COM9",
  "LPT1",
  "LPT2",
  "LPT3",
  "LPT4",
  "LPT5",
  "LPT6",
  "LPT7",
  "LPT8",
  "LPT9",
]);

export function isWindowsReservedName(title: string): boolean {
  const stem = title.trim().replace(/[.\s]+$/g, "");
  if (!stem) return false;
  return WINDOWS_RESERVED_NAMES.has(stem.toUpperCase());
}

export function hasInvalidFilenameChars(title: string): boolean {
  return BAD_FILENAME_CHARS.test(title) || title.includes("..");
}

export function sanitizeFilenameInput(title: string): string {
  return title.replace(/[\\/:*?"<>|]/g, "").replace(/\.\./g, "");
}

export function validateFilenameTitle(title: string): string | null {
  const trimmed = title.trim();
  if (!trimmed) return "标题不能为空";
  if (hasInvalidFilenameChars(trimmed)) return "标题包含非法文件名字符（\\ / : * ? \" < > |）";
  if (trimmed.includes("..")) return "无效文件名";
  if (/[.\s]$/.test(trimmed)) return "标题不能以空格或点结尾";
  if (isWindowsReservedName(trimmed)) {
    return "标题不能使用 Windows 保留名称（如 CON、NUL）";
  }
  return null;
}
