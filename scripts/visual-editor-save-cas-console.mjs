export const BLOCKING_LOG_PREFIX = "[mk-perf-blocking] ";

const SAVE_COMMAND_LABEL = /^invoke:(?:write_default_note_checked|write_note_checked)$/;

/**
 * 解析前端同步 Tauri bridge 调用的结构化日志。
 * 普通 `mk-perf` Promise 耗时、读取命令和非法数值都不属于 T4 blockingMs 样本。
 */
export function parseBlockingConsoleMessage(message) {
  if (typeof message !== "string" || !message.startsWith(BLOCKING_LOG_PREFIX)) {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(message.slice(BLOCKING_LOG_PREFIX.length));
  } catch {
    return null;
  }

  if (typeof payload !== "object" || payload === null) return null;
  const label = payload.label;
  const blockingMs = payload.blockingMs;
  const status = payload.status;
  if (
    typeof label !== "string" ||
    !SAVE_COMMAND_LABEL.test(label) ||
    (status !== "ok" && status !== "error") ||
    typeof blockingMs !== "number" ||
    !Number.isFinite(blockingMs) ||
    blockingMs < 0
  ) {
    return null;
  }

  return { label, blockingMs, status };
}
