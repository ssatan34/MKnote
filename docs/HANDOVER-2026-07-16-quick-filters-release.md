# Quick 标签筛选与 4.1.1 发布交接

- 日期：2026-07-16
- 交出方：Codex
- 接手方：Codex / 后续维护 Agent
- 当前状态：已完成，等待人工 UI 验收
- 交接目标：记录 Quick Pocket / Quick Todo 标签筛选功能、验证结果与本次发行产物。

## 一句话状态

MKnote v4.1.1 已加入 Quick Pocket 与 Quick Todo 的标签筛选，并完成前端构建、Tauri 发行构建和绿色 ZIP 打包；发行产物已生成，仍建议在实际窗口中做一次点击验收。

## 接手目标

后续维护只需验证四类筛选按钮的视觉位置和点击行为；不需要新增数据字段或 Rust command。

## 当前事实

- Quick Pocket 底部提供文本、命令、路径、隐私四类筛选；再次点击当前标签恢复全部列表。
- Quick Todo 右下角提供重要、等待、下一步、想法四类筛选；再次点击当前标签恢复全部列表。
- Quick Todo 筛选状态下禁用拖拽手柄，避免过滤后的扁平列表破坏现有父子 Todo 同父级排序契约；恢复默认列表后拖拽保持原行为。
- Quick Todo 的 `createdAt` 数据链路保持不变，筛选仅基于现有 `tag` 字段。
- 绿色包只包含 `MarkdownStickyNote.exe` 与 UTF-8 BOM 的 `README.txt`，未携带开发机便签数据。

## 关键文件与路径

| 路径 | 状态 | 用途 |
|---|---|---|
| `C:\Projects\MKnote\src\components\QuickPocketPanel.tsx` | 已改 | Pocket 筛选状态、底部按钮与可见列表 |
| `C:\Projects\MKnote\src\components\QuickTodoPanel.tsx` | 已改 | Todo 筛选状态、右下角按钮与可见列表 |
| `C:\Projects\MKnote\src\utils\quickPocketModel.ts` | 已改 | Pocket 筛选与筛选拖拽辅助函数 |
| `C:\Projects\MKnote\src\utils\quickTodoModel.ts` | 已改 | Todo 标签筛选纯函数 |
| `C:\Projects\MKnote\tests\quickPocket.test.ts` | 已改 | Pocket 筛选与筛选拖拽测试 |
| `C:\Projects\MKnote\tests\quickTodo.test.ts` | 已改 | Todo 筛选测试 |
| `C:\Projects\MKnote\MKnote-portable-v4.1.1-20260716-222221.zip` | 新生成 | 绿色便携版 ZIP |
| `C:\Projects\MKnote\src-tauri\target\release\bundle\msi\MD Sticky Note_4.1.1_x64_en-US.msi` | 新生成 | MSI 安装包 |
| `C:\Projects\MKnote\src-tauri\target\release\bundle\nsis\MD Sticky Note_4.1.1_x64-setup.exe` | 新生成 | NSIS 安装包 |

## 验证状态

| 验证项 | 结果 | 证据 |
|---|---|---|
| Quick Pocket 专项测试 | 通过，11/11 | `npm.cmd run test:quick-pocket` |
| 前端 TypeScript/Vite 构建 | 通过 | `npm.cmd run build` |
| Tauri 发行构建 | 通过 | `npm.cmd run build:green` |
| MSI / NSIS 产物 | 已生成 | `src-tauri\target\release\bundle\` |
| 绿色 ZIP | 已生成 | `MKnote-portable-v4.1.1-20260716-222221.zip` |
| Quick Todo 全量测试 | 54/60，通过但有 6 条既有静态断言失败 | `npm.cmd run test:quick-todo`；失败集中在旧的图标、CSS、窗口源码匹配，不涉及本次筛选模型测试 |
| Git 空白检查 | 通过 | `git diff --check` |
| 人工窗口点击验收 | 未完成 | 需启动绿色版或开发版后点击四类筛选按钮确认视觉位置与交互 |

## 关键决策与限制

- 筛选复用已有 `tag` 字段，不增加配置、数据库或 Tauri command。
- Quick Pocket 筛选状态仍允许拖拽，并会保留未筛选条目的顺序位置。
- Quick Todo 筛选状态不允许拖拽；这是为了保护已验证的父子 Todo 排序边界。
- `npm run build:green` 的 Rust 构建输出包含现有 unused/private-interface 警告，但命令退出码为 0，未将无关警告扩展为本次清理范围。

## 接手后的第一步

1. 启动 `C:\Projects\MKnote\portable\MarkdownStickyNote.exe` 或执行 `npm run tauri dev`。
2. 打开 Quick Pocket / Quick Todo，逐个点击筛选 icon，再次点击当前 icon，确认列表与计数恢复。
3. 若人工验收通过，只需在后续发布记录中补充验收日期；无需修改筛选实现。

## 完成条件

- Quick Pocket 与 Quick Todo 四类筛选均可点击、取消并显示正确条目。
- 默认列表、标签数据、创建时间和现有 Quick 窗口行为不被筛选状态破坏。
- 发行 ZIP、MSI、NSIS 均保留在对应输出路径，并由 Git 提交代码与文档变更。
