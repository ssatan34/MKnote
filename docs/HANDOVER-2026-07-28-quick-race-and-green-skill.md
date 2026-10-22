# Quick Todo / Quick Pocket 并发修复与绿色打包 Skill 交接

- 日期：2026-07-28
- 范围：Quick Todo / Quick Pocket 删除、新建、修改连续操作的一致性修复；绿色版打包说明；项目本地 Skill
- 状态：完成，已获用户验收

## 一句话结论

本轮修复了快速连续操作时旧异步响应覆盖新状态、Todo 写操作交叉落盘，以及非默认 Pocket 删除时配置与文件不一致的风险。绿色便携版打包流程已整理为 `.agents/skills/mknote-green-package`，并保留现有 `npm.cmd run build:green` 作为唯一构建入口。

## 已完成

- Quick Todo controller 为列表请求增加版本保护，并用串行 mutation queue 保证新增、删除、修改、完成和排序按触发顺序落盘。
- Quick Pocket controller 为列表/操作增加最新请求保护，切换 Pocket 时先清空旧快照，避免旧 Pocket 内容短暂或错误回流。
- Quick Pocket 删除改为“先暂存文件 → 保存配置 → 删除暂存文件”；任一步失败都尝试恢复文件和配置，避免只删配置或只删文件。
- S3 同步对 Quick Todo/Pocket 的本地 CRUD 保留冲突副本，不立即用旧远端基线覆盖本地结果。
- 为上述边界补充了 TypeScript 与 Rust 定向测试。
- 绿色包 README 增加单实例提示：测试前应退出源码开发版或旧版，否则新 EXE 的启动请求可能被旧实例接管。
- 新增本地 Skill：`.agents/skills/mknote-green-package/SKILL.md`，附带 `evals/evals.json`。

## 验证证据

| 命令 | 结果 |
|---|---|
| `npm.cmd run test:quick-pocket` | 28 passed，0 failed |
| `npm.cmd run build` | 通过；存在既有大 chunk warning |
| `npm.cmd run test:quick-todo` | 57 passed，6 个既有静态 UI 断言失败 |
| `npm.cmd run build:green` | 本轮已成功生成绿色 ZIP；ZIP 内容为 `MarkdownStickyNote.exe` 与 `README.txt` |
| `git diff --check` | 通过 |

Quick Todo 的 6 个失败集中在历史 UI 静态断言（图标、颜色、样式、关闭按钮和窗口锁定文案），不涉及本轮并发/删除修复；不要为了让旧断言全绿而回退数据一致性改动。

## 关键文件

- `src/hooks/useQuickTodoController.ts`
- `src/hooks/useQuickPocketController.ts`
- `src/utils/quickTodoModel.ts`
- `src/utils/quickPocketModel.ts`
- `src-tauri/src/quick_pocket.rs`
- `src-tauri/src/sync.rs`
- `tests/quickTodo.test.ts`
- `tests/quickPocket.test.ts`
- `.agents/skills/mknote-green-package/SKILL.md`

## 后续约束

- 绿色包只使用 `npm.cmd run build:green`；不要直接压缩旧 `src-tauri/target/release` EXE。
- 构建命令超时后先检查 `dist/index.html`、release EXE、`portable/MarkdownStickyNote.exe` 和最新 ZIP 的时间与大小，再判断是否需要重跑。
- 清理构建产物时只删除明确确认的 `dist/`、`portable/`、`portable-release/`、`src-tauri/target/`、旧时间戳 ZIP 和运行态截图/Smoke 目录；不删除源码、配置和用户便签。
