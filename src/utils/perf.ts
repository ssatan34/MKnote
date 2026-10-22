export type PerfMeta = Record<string, string | number | boolean | null | undefined>;

const SLOW_THRESHOLD_MS = 80;
const SENSITIVE_KEY_RE = /(content|body|text|token|secret|password|path|file|dir|url)/i;

function isDevMode() {
  return Boolean(import.meta.env?.DEV);
}

function isPerfEnabled() {
  try {
    return isDevMode() || window.localStorage.getItem("mkPerf") === "1";
  } catch {
    return isDevMode();
  }
}

function sanitizeMeta(meta?: PerfMeta): PerfMeta | undefined {
  if (!meta) return undefined;
  return Object.fromEntries(
    Object.entries(meta)
      .filter(([key]) => !SENSITIVE_KEY_RE.test(key))
      .map(([key, value]) => [key, value == null ? value : String(value)]),
  );
}

function logPerf(
  label: string,
  durationMs: number,
  meta?: PerfMeta,
  status: "ok" | "error" | "mark" = "ok",
) {
  if (!isPerfEnabled()) return;
  const rounded = Math.round(durationMs * 10) / 10;
  const payload = sanitizeMeta({ ...meta, status, durationMs: rounded });
  const message = `[mk-perf] ${label} ${rounded}ms`;
  const log = rounded >= SLOW_THRESHOLD_MS || status === "error" ? console.warn : console.debug;
  log(message, payload ?? "");
}

function logBlocking(
  label: string,
  durationMs: number,
  meta?: PerfMeta,
  status: "ok" | "error" = "ok",
) {
  if (!isPerfEnabled()) return;
  const rounded = Math.round(durationMs * 10) / 10;
  const payload = sanitizeMeta(meta) ?? {};
  const message = `[mk-perf-blocking] ${JSON.stringify({
    label,
    blockingMs: rounded,
    status,
    ...payload,
  })}`;
  if (status === "error" || rounded >= SLOW_THRESHOLD_MS) {
    console.warn(message);
  } else {
    console.debug(message);
  }
}

/**
 * 测量同步调用窗口，而不是等待 Promise 完成的端到端耗时。
 * T4 保存/CAS 证据只把这个窗口作为 `blockingMs` 候选，避免把磁盘 IO 或轮询时间混入主线程指标。
 */
export function measureBlocking<T>(label: string, fn: () => T, meta?: PerfMeta): T {
  const started = performance.now();
  try {
    const result = fn();
    logBlocking(label, performance.now() - started, meta, "ok");
    return result;
  } catch (error) {
    logBlocking(label, performance.now() - started, meta, "error");
    throw error;
  }
}

export async function measureAsync<T>(
  label: string,
  fn: () => Promise<T>,
  meta?: PerfMeta,
): Promise<T> {
  const started = performance.now();
  try {
    const result = await fn();
    logPerf(label, performance.now() - started, meta, "ok");
    return result;
  } catch (error) {
    logPerf(label, performance.now() - started, meta, "error");
    throw error;
  }
}

export function measureSync<T>(label: string, fn: () => T, meta?: PerfMeta): T {
  const started = performance.now();
  try {
    const result = fn();
    logPerf(label, performance.now() - started, meta, "ok");
    return result;
  } catch (error) {
    logPerf(label, performance.now() - started, meta, "error");
    throw error;
  }
}

export function markPerf(label: string, meta?: PerfMeta) {
  logPerf(label, 0, meta, "mark");
}
