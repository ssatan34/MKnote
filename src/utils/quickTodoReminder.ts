const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export function formatQuickTodoCountdown(remindAt: string, now = new Date()): string | null {
  const target = Date.parse(remindAt);
  if (!Number.isFinite(target)) return null;
  const remaining = target - now.getTime();
  if (remaining <= 0) return null;

  const totalMinutes = Math.ceil(remaining / MINUTE_MS);
  if (remaining < DAY_MS) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }

  const days = Math.ceil(remaining / DAY_MS);
  if (days <= 31) return `${days}天`;
  if (days < 365) return `${Math.floor(days / 30)}个月+`;
  return `${Math.floor(days / 365)}年+`;
}

export function toQuickTodoDateTimeInput(remindAt: string | null): string {
  if (!remindAt) return "";
  const date = new Date(remindAt);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromQuickTodoDateTimeInput(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
