# Quick Todo UI 标签 Task 4 实施报告

## 范围

仅执行 `2026-07-11-quick-todo-ui-tags-implementation.md` 的 Task 4：依据根目录 `DESIGN.md` 对齐程序内 Quick Todo 面板样式。未修改业务逻辑，未进入 Stage C。

## TDD 证据

### RED

- 在 `tests/quickTodo.test.ts` 新增 CSS 契约测试。
- 首次运行 `npm.cmd run test:quick-todo`：16 passed，1 failed。
- 失败原因符合预期：面板仍为 `350px`，不满足 `430–450px` 契约；旧 CSS 同时仍包含阴影和非契约 token。

### GREEN

- 重写 `QuickTodoPanel.css` 与 `QuickTodoEntry.css` 后再次运行：17 passed，0 failed。
- 契约覆盖：面板宽度、禁止阴影/非契约 token/固定色、必需设计 token、固定标签槽、弹性文字区、10px 面板圆角、picker 绝对定位。

## UI 调整

- 面板宽度改为 440px，并保留视口窄时的安全上限。
- 面板使用 `--mk-canvas`、1px `--mk-hairline`、10px 圆角，不使用阴影。
- 标题、输入、列表行和底部通过 `--mk-hairline` / `--mk-divider` 分区。
- 标题和正文分别使用项目 display/text 字体 token。
- 输入区使用 `--mk-parchment` 层级，输入框使用 Canvas 与 hairline。
- icon button 统一为 28–30px、8px 圆角；hover/focus 使用 Pearl/Primary。
- Todo 行固定为：18px 完成圆圈、弹性文字、28px 标签槽、28px 删除槽。
- 无标签行始终保留标签槽；默认隐藏中性 icon，只在行 hover、按钮 focus 或 picker 展开时显示，避免布局跳动。
- 标签选择器使用 Canvas、hairline、10px 圆角与绝对定位；已选项使用 Pearl/Primary。
- 所有颜色均由 `--mk-*` token 驱动，未增加浅色/深色硬编码。

## 修改文件

- `src/components/QuickTodoPanel.css`
- `src/components/QuickTodoEntry.css`
- `tests/quickTodo.test.ts`

## 验证

- `npm.cmd run test:quick-todo`：17 passed，0 failed。
- `npm.cmd run build`：通过；Vite 既有大 chunk warning 保留。
- `git diff --check`：通过，无 whitespace error。

## 已知疑虑与人工验收点

- 自动测试只能证明 CSS 契约，不能替代可见验收。
- 需在浅色和深色主题下确认 440px 面板、picker 与行操作的视觉密度。
- 需确认较长 Todo 文本换行时，固定标签/删除槽仍符合预期。
- 需确认列表靠近上下边界时，picker 的实际可见区域和点击体验；当前行 picker 向左展开以减少右侧裁切风险。
