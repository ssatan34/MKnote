# MKnote 5.2.2 发布记录

日期：2026-10-16。用户已确认 Tab 右键复制笔记路径验收通过，并授权升级版本、清理本轮工作区、更新文档及本地 Git 提交。

## 改动与实现

- 常规 Tab、置顶 Tab 及置顶「更多」列表的右键菜单新增「复制笔记路径」。复制针对右键点中的笔记，无需切换当前笔记。
- 复制内容为完整目录、原始文件名与扩展名；支持 Inbox、Default、自定义文件夹与 Private 区域，保留中文及空格。
- `src/components/NoteTabsBar.tsx` 复用现有 `notesService.getDir` 获取实际目录，以 Tauri `join` 拼接文件名，再调用剪贴板 API；目录读取或复制失败时显示错误提示。未新增依赖或后端命令。

## 验证与用户验收

- 前端构建通过；隔离组件交互覆盖常规当前／非当前 Tab、置顶 Tab、置顶溢出列表、四类笔记区域、完整路径与扩展名、复制后不切换笔记，以及目录读取／剪贴板写入失败提示。
- 隔离交互使用模拟目录、Tauri IPC 与剪贴板；自动检查不代表真实 Windows 剪贴板验证。报告保留于 `.codex-smoke/tab-copy-path/result.json`。
- 用户试用 `MKnote-portable-v5.2.1-20261016-000145.zip` 后明确反馈「验收通过」。该 ZIP SHA-256 为 `43494BC1B5AC47D865BC80F66B180CA4616F8AC553A2CD2B64E7631CD3BE6A20`，历史包继续保留。
- 本轮验收后仅同步版本与文档，行为代码未再修改，不重复已通过的交互检查。

## 版本与绿色包

package.json、package-lock 顶层与根包、Tauri 配置、Cargo.toml / Cargo.lock 本项目版本统一为 5.2.2。

- 构建：`npm.cmd run tauri -- build --no-bundle`，随后调用现有 `scripts/pack-green.ps1`；前端与优化 Release 构建通过，不生成 MSI / NSIS。
- 绿色包：`MKnote-portable-v5.2.2-20261016-000820.zip`，13,709,372 字节，只含 `MarkdownStickyNote.exe` 与 `README.txt`。
- ZIP SHA-256：`90EF7AEAD63D723F14F8146D1778B43B44A7E5882086A05BA6A7252ADE2E5CC5`。
- EXE SHA-256：`93D5DD5A239FE71F887E12CAD4BF60C22DE0B5AC67DD772D154E3588A81CF45E`；release、portable、portable-release 与 ZIP 内 EXE 一致，ProductVersion / FileVersion 均为 5.2.2，EXE 构建时间晚于本次前端输出。
- Vite 大块提示与 10 项 Rust 未使用代码提示为 warning，未导致构建失败。包校验证据保留于 `.codex-smoke/release-5.2.2/package-verification.json`。

绿色包按当前工作区构建，包含先前未提交的 Quick Todo / Quick Pocket 等改动；本轮验收声明与 Git 提交范围仅覆盖复制路径、版本号及相关文档，不将其他功能改动归入本轮验收。

## 工作区与提交范围

本次提交 `NoteTabsBar.tsx`、版本元数据和当前 README／功能概要／项目总结／实施说明／UI 规格／Agent 交接／本发布记录。共享文件仅暂存本轮片段，保留原有 Quick 功能、Windows Shell 依赖及可视化编辑技术栈说明等改动；原有未跟踪源码和品牌 SVG 不删除、不提交。

根目录 `MarkdownStickyNote.exe` 与 `README.txt` 经哈希确认是便携目录副本，且正式进程位于 `C:\MDnote`。自动审批拒绝删除命令（仅返回 `blocked by policy`），改为可恢复归档至 `.codex-smoke/release-5.2.2/archive/`，根目录副本已移走，不声称释放磁盘空间。保留历史 ZIP、构建缓存与必要验证报告；清理记录为 `.codex-smoke/release-5.2.2/cleanup-verification.json`。

## 使用与边界

本轮不启动同标识 EXE，不替换 `C:\MDnote` 的正式程序，不写入真实笔记或配置，不推送远端。5.2.2 包的自动核验覆盖文件、版本、时间和哈希，运行行为沿用上面的隔离检查及用户验收。使用新包前须从托盘退出旧实例，避免单实例机制将启动请求转给旧程序。
