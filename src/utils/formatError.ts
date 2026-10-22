/** 将后端/IO 错误转为更易读的提示 */
export function formatError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  const msg = raw.trim() || "未知错误";

  if (msg.includes("尚未设置便签数据目录")) {
    return "尚未选择便签数据目录，请先选择或更换目录。";
  }
  if (msg.includes("便签数据目录不存在") || msg.includes("不可访问")) {
    return "便签数据目录不存在或无法访问，请检查路径或重新选择目录。";
  }
  if (msg.includes("无效文件名") || msg.includes(".md 结尾")) {
    return "便签文件名无效，请仅使用 .md 文件。";
  }
  if (msg.includes("os error 2") || msg.includes("No such file")) {
    return "文件或目录不存在，可能已被移动或删除。";
  }
  if (msg.includes("Permission denied") || msg.includes("拒绝访问")) {
    return "没有读写权限，请检查文件夹权限或以管理员运行。";
  }
  if (msg.includes("无法定位用户配置目录")) {
    return "无法写入应用配置，请检查 %AppData% 是否可用。";
  }

  return msg;
}
