# Quick Todo UI Tags Task 3 实施报告

日期：2026-07-11
范围：`2026-07-11-quick-todo-ui-tags-implementation.md` Task 3
状态：完成，等待 Task 4 视觉样式接续

## 完成内容

- 新增共享 `QuickTodoTagPicker`：`radiogroup` + 四个 `radio`，仅渲染项目 Icon，文字只用于 `title` / `aria-label`。
- 新建待办支持单选标签与再次选择取消；提交成功清空文字和标签，失败保留二者。
- 已有待办提供固定标签槽，可直接设置、替换、取消标签；服务失败时沿用既有非乐观列表动作，原列表不变并显示错误。
- 全面移除“今天”渲染以及 Task 2 临时 `isCreatedToday` 兼容桥。
- `activePicker` 使用单一标识，保证新建区与各 Todo 行同一时间最多打开一个 picker。
- Esc 层级改为：picker 打开时先关闭 picker；picker 已关闭时再关闭面板并由既有入口逻辑恢复 trigger 焦点。
- 本任务未提前重写最终 CSS；最终宽度、定位、hover 显隐和 DESIGN.md token 合规由 Task 4 完成。

## TDD 证据

RED：新增测试后 3 项失败：标签提交模型缺失、Esc picker 层级缺失、`QuickTodoTagPicker.tsx` 不存在。

GREEN：

- `npm.cmd run test:quick-todo`：14 passed，0 failed。
- `tsc --noEmit`：通过。
- `npm.cmd run build`：通过（仅既有 Vite chunk size warning）。
- `git diff --check`：通过。

## 关键行为说明

- 添加失败不会执行 `setDraft` / `setDraftTag`，因此输入与标签保持。
- 设置已有 Todo 标签不做乐观更新；失败时 `runQuickTodoListAction` 返回原数组，避免 UI 与 Markdown 真相源分叉。
- picker 选择后立即关闭；设置失败仍保留原列表标签，并通过面板 error 显示失败。

## 接续注意事项

- Task 4 必须为 `.quick-todo-tag-control`、`.quick-todo-tag-picker`、`.quick-todo-row-tag` 提供最终定位和 token-only 样式。
- Task 4 应确保无标签中性 Icon 仅在 hover/focus 时可见，但固定槽位始终保留，避免文字抖动。

## 复审返工

Task 3 首轮复审发现触发器可访问名称没有表达当前标签状态，且测试只检查源码结构。返工后：

- 新增 `quickTodoTagControlLabel`，无标签返回“添加标签”，有标签返回“标签：重要/等待/下一步/想法”。
- 新建区和 Todo 行标签触发器均同时设置动态 `aria-label` 与 `title`。
- 本轮新增/涉及的 Icon 按钮均同时提供 `aria-label` 与 `title`；四个 picker radio 同样具备两者。
- 提取不依赖 JSX loader 的 `QuickTodoTagPickerBase`，生产组件仍通过项目 `<Icon>` 注入图标。
- 使用 `react-dom/server` 的 `renderToStaticMarkup` 对真实 Base 组件进行最小渲染测试，验证一个 `radiogroup`、四个 `radio`、仅一个 `aria-checked=true` 及 icon-only 内容。

返工验证：

- `npm.cmd run test:quick-todo`：16 passed，0 failed。
- `tsc --noEmit`：通过。
- `npm.cmd run build`：通过（仅既有 Vite chunk size warning）。
