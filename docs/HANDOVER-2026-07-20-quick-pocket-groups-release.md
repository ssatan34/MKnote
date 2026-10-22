# Quick Pocket 分组与 v4.1.2 发布总结

- 日期：2026-07-20
- 范围：Quick Pocket 单层分组、相关 UI 收口、v4.1.2 文档与 Windows 分发产物
- 状态：部分完成（构建与包内容验证完成，运行态 smoke 受已有单实例进程阻塞）

## 一句话结论

Quick Pocket 单层分组及约定 UI 已进入 v4.1.2，前端构建、分组专项测试和 Windows 发行打包均完成；绿色 ZIP 内容干净。运行态 release smoke 因开发版 MKnote 已占用单实例而未能独立启动，人工窗口视觉与真实拖拽验收仍需在关闭现有 MKnote 后补做。

## 目标与范围

- 目标：让 Quick Pocket 条目支持创建分组、解散分组、组内新增、跨组拖拽和整组排序，并按已确认规格完成 UI 与持久化。
- 包含：React 交互与样式、前端分组模型和控制器、Rust Markdown 持久化、旧数据兼容、测试、文档、绿色 ZIP、MSI 和 NSIS。
- 不包含：嵌套分组、单条目或空分组、批量加入分组、标签筛选时保留分组结构。

## 已完成

- 分组与普通条目统一混排，分组可整体拖拽到普通条目上方或下方。
- 两个未分组条目按上 25% / 中间 50% / 下 25% 判断排序或建组；已有分组内外的条目移动只按上、下半区排序。
- 支持组名创建与双击重命名、组内新增、解散、组内排序、拖入、拖出和跨组移动。
- 分组少于两个条目时自动解散；解散不删除条目；不允许空分组、单条目分组或嵌套。
- 标签筛选时扁平显示条目、不显示组名，并禁用跨分组拖拽。
- 分组折叠状态在前端持久化；Rust 端保存分组关系并兼容既有 Quick Pocket Markdown。
- 分组标题栏采用紧凑高度、强调色拖拽手柄、整组轮廓线和右对齐操作区。
- 建组命名输入复用资料库“新建文件夹”的下划线输入样式，固定在顶部工具栏下方；输入框与 `Add` 使用统一 40px 高度。
- 版本号已统一为 4.1.2，相关产品说明与 UI 规格已同步。

## 关键决策

| 决策 | 原因 | 影响 |
|---|---|---|
| 分组是统一列表中的复合条目 | 避免已分组内容固定置顶 | 普通条目可位于任意分组前后 |
| 仅两个未分组条目的中间区域可建组 | 保持创建分组直觉，同时避免组内移动歧义 | 组内、跨组和拖入分组只做上下排序 |
| 分组最少两个成员 | 避免没有组织价值的单条目容器 | 删除或拖出导致只剩一项时自动解散 |
| 标签筛选忽略分组 | 筛选目标是条目标签而非组织结构 | 筛选结果扁平显示，跨组拖拽暂时禁用 |
| 组名允许重复且不支持嵌套 | 保持实现和使用心智简单 | 分组由稳定 ID 区分，不由名称唯一标识 |

## 产物与证据

| 类型 | 路径或证据 | 说明 |
|---|---|---|
| 绿色 ZIP | `C:\Projects\MKnote\MKnote-portable-v4.1.2-20260720-002020.zip` | 7,586,798 字节；仅含 EXE 与 README |
| ZIP SHA-256 | `D8F4622D6EBBDABC3B571B4D476E05DEF63B16DA3C951240BBF25133943808F0` | 分发文件校验值 |
| 便携目录 | `C:\Projects\MKnote\portable-release` | 仅含 `MarkdownStickyNote.exe` 与 `README.txt` |
| MSI | `C:\Projects\MKnote\src-tauri\target\release\bundle\msi\MD Sticky Note_4.1.2_x64_en-US.msi` | Tauri x64 安装包 |
| NSIS | `C:\Projects\MKnote\src-tauri\target\release\bundle\nsis\MD Sticky Note_4.1.2_x64-setup.exe` | Tauri x64 安装程序 |
| 专项测试 | `npm.cmd run test:quick-pocket` | 18/18 通过 |
| 输入测试 | `npm.cmd run test:quick-input` | 2/2 通过 |
| 前端构建 | `npm.cmd run build` | TypeScript 与 Vite 构建通过；仅保留既有大 chunk 警告 |
| 发行构建 | `npm.cmd run build:green` | 通过；生成 release EXE、MSI、NSIS 和绿色 ZIP；Rust 保留 13 条既有 warning |
| Quick Todo 全量测试 | `npm.cmd run test:quick-todo` | 55/61 通过；6 个旧结构断言失败，与本次 Quick Pocket 分组无直接关系 |
| UI 规格 | `C:\Projects\MKnote\docs\MKnote-UI-v2.md` | 记录分组约束、标题栏、拖拽建组和筛选规则 |

## 未完成与风险

- `npm.cmd run smoke:release` 与 `npm.cmd run smoke:release:input` 均未完成运行态验证。执行时已有 `C:\Projects\MKnote\src-tauri\target\debug\md-sticky-note.exe` 进程占用应用单实例，release 进程在创建窗口前以 `ExitCode=0` 退出。为避免打断现有会话，本轮未强制结束该进程。
- Quick Todo 全量套件仍有 6 个旧结构断言，涉及已变更的入口颜色、标签结构、完成控件、CSS 契约、窗口监控和关闭按钮结构；没有为满足旧断言而回退现有 UI。
- 尚未在本次最终 40px 建组命名输入样式下完成独立窗口截图对照。
- 尚未以真实鼠标完整复验建组、拖入、拖出、跨组和整组排序；自动测试覆盖模型与源码契约，不能替代桌面交互验收。

## 建议下一步

1. 使用者保存工作并正常退出当前开发版 MKnote，确认任务管理器中不存在 `md-sticky-note.exe`。
2. 重新运行 `npm.cmd run smoke:release` 和 `npm.cmd run smoke:release:input`，两项均应创建可见主窗口、生成非空白截图，输入 smoke 还应确认自动保存 marker。
3. 在独立 Quick Pocket 窗口用真实鼠标复验：两个未分组条目建组、组名输入、组内排序、拖入、拖出、跨组移动、整组排序、自动解散和标签筛选扁平显示。
