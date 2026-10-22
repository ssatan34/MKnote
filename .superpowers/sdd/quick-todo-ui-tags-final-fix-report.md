# Quick Todo UI 标签最终 Minor 修复报告

日期：2026-07-11

## 修复范围

1. 补充 unknown tag 目标行的直接回归测试：初次读取保持原文不变；对同一目标执行 `set_tag` 或 `toggle` 后，未知 `tag` 被清理，且待办仍可管理。
2. Quick Todo 完成圆圈按钮使用同一 `completionLabel` 同步驱动中文 `aria-label` 与 `title`，并增加最小源码回归测试。

## TDD 证据

- 前端 RED：新测试因完成按钮缺少共享 `completionLabel` 及 `title` 而按预期失败（17 passed, 1 failed）。
- GREEN：最小修改后 Quick Todo 测试 18 passed, 0 failed。
- Rust 行为在生产代码中已满足复审要求，新增直接行为测试用于固化该语义。

## 验证结果

- Rust 聚焦测试 `unknown_tag_is_removed_when_the_target_is_managed`：1 passed, 0 failed。
- `npm.cmd run test:quick-todo`：18 passed, 0 failed。
- `npm.cmd run build`：通过（Vite 2283 modules transformed）。首次沙箱内构建因 esbuild `spawn EPERM` 失败，在已批准的沙箱外构建中通过。
- `git diff --check`：通过。

## 边界

- 未提交。
- 未执行 reset/clean。
- 保留现有 dirty worktree，未修改其他功能。
