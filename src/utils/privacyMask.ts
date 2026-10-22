const SECRET_LINE =
  /\bsk-[a-zA-Z0-9_-]{8,}\b|api[_-]?key|api[_-]?token|bearer\s+|secret[_-]?key/i;

/** 截图 / 演示时遮罩疑似密钥行（不修改磁盘内容）。 */
export function maskSensitiveContent(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      if (!SECRET_LINE.test(line)) return line;
      let masked = line.replace(/\bsk-[a-zA-Z0-9_-]+\b/gi, "sk-••••••••");
      masked = masked.replace(
        /(\b(?:api[_-]?key|api[_-]?token|secret|bearer)\b\s*[:=]?\s*)(["']?)([a-zA-Z0-9_\-./+=]{6,})\2?/gi,
        "$1$2••••••••",
      );
      masked = masked.replace(/\b([a-zA-Z0-9_\-]{20,})\b/g, "••••••••");
      return masked;
    })
    .join("\n");
}

export function contentMayContainSecrets(text: string): boolean {
  return SECRET_LINE.test(text);
}
