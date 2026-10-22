# Quick Todo UI 标签 Task 2 实施报告

## 状态

DONE

## TDD 证据

### RED

先修改 `tests/quickTodo.test.ts` 定义期望契约，再运行：

```powershell
npm.cmd run test:quick-todo
```

结果：失败，`ERR_MODULE_NOT_FOUND`，缺少 `src/utils/quickTodoTags.ts`。失败原因与计划一致：标签模型尚未实现。

### GREEN

实现后重新运行：

```powershell
npm.cmd run test:quick-todo
```

结果：12 passed，0 failed。

## 实现内容

- 新增 `QuickTodoTag = important | waiting | next | idea`。
- `QuickTodoItem` 新增 `tag: QuickTodoTag | null`，移除 `isCreatedToday`。
- 新增固定标签定义 `QUICK_TODO_TAGS`与可取消单选函数 `toggleQuickTodoTag`。
- `createQuickTodoService.add(text, tag)` 映射 `quick_todo_add`；新增 `setTag(id, tag)` 映射 `quick_todo_set_tag`。
- 在项目 Icon manifest 与 SVG 资产中新增中性标签、火焰、沙漏、闪电、灯泡图标。均使用 `viewBox="0 0 24 24"`、`stroke="currentColor"`、`stroke-width="1.5"`，无 emoji、第三方库或写死颜色。

## 文件范围

- `src/utils/quickTodoModel.ts`
- `src/utils/quickTodoTags.ts`
- `src/utils/quickTodoService.ts`
- `src/assets/icon-manifest.json`
- `src/assets/icons/tag.svg`
- `src/assets/icons/quick-todo-important.svg`
- `src/assets/icons/quick-todo-waiting.svg`
- `src/assets/icons/quick-todo-next.svg`
- `src/assets/icons/quick-todo-idea.svg`
- `tests/quickTodo.test.ts`

`src/services/quickTodoService.ts` 不需额外代码：它通过 `createQuickTodoService` 推导并自动暴露新方法。`src/components/Icon.tsx` 也无需修改：现有 manifest + glob 注册机制已正确消费新 SVG。

## 初次复审发现（已解决）

Task 2 初次单独执行 `npm.cmd run build` 曾在现有 Task 3 消费端失败：

- `QuickTodoEntry.tsx` 仍以单参数调用 `add`。
- `QuickTodoPanel.tsx` 仍导入已按规格移除的 `isCreatedToday`。

复审要求独立质量门后，已用下文的兼容过渡解决，当前构建已通过。

## 复审返工：独立质量门兼容过渡

复审要求 Task 2 在 Task 3 尚未接线时也必须可独立构建。

### RED

先新增两项兼容契约：

- `service.add(text)` 省略标签时应映射为 `tag: null`。
- Task 2 过渡期仍导出 `isCreatedToday`，保证旧面板可构建。

运行 `npm.cmd run test:quick-todo` 后按预期失败：`quickTodoModel.ts` 未导出 `isCreatedToday`。

### GREEN

- `add(text, tag: QuickTodoTag | null = null)` 提供无标签默认值。
- 临时恢复 `isCreatedToday`，并以 `@deprecated` 明确标注仅为 Task 2 build bridge，由 Task 3 删除。

验证：

```text
npm.cmd run test:quick-todo -> 13 passed, 0 failed
npm.cmd run build           -> exit 0
```

注：沙箱内 Vite/esbuild 启动子进程遇到 `spawn EPERM`，在已授权的沙箱外重运生产构建后通过。仅有仓库既有 chunk-size warning，无 TypeScript 或 Vite 构建错误。
