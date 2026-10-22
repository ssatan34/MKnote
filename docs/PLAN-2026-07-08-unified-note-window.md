# 统一笔记窗口模式实施计划

日期：2026-07-08

## 目标

将“同一个笔记”的便签模式和胶囊模式改为同一个原生窗口内的两种形态，通过窗口 resize 与 UI 状态切换实现真正连续变形。

最终目标是不再依赖“关闭 Popout 窗口，再创建 Capsule 窗口”的接力逻辑。

## 非目标

- 不重做主窗口 Tab、资料库、编辑器核心能力。
- 不改笔记数据结构。
- 不在新路径稳定前删除旧双窗口路径。

## Phase 0：三层保险

### 0.1 Git 保险

检查当前工作区状态，确认现有动画、拖拽、胶囊位置相关改动都已经是用户验收版本。

创建 checkpoint 提交，建议提交信息：

```text
checkpoint: accepted window animation and tab drag behavior
```

### 0.2 分支保险

从 checkpoint 创建新分支：

```text
codex/unified-note-window-mode
```

### 0.3 文件快照保险

对窗口状态相关文件做一份本地快照，建议放到：

```text
docs/dev-backups/unified-note-window-YYYYMMDD-HHMM/
```

快照文件至少包括：

- `src-tauri/src/detach.rs`
- `src-tauri/src/lib.rs`
- `src-tauri/capabilities/default.json`
- `src/main.tsx`
- `src/services/windowService.ts`
- `src/components/PopoutView.tsx`
- `src/components/CapsuleView.tsx`
- `src/App.css`
- `src/App.tsx`

## Phase 1：梳理现有窗口状态机

### 1.1 标记现有路径

梳理并记录以下流程：

- 主窗口拖出 Tab → 创建 Popout
- Popout → Capsule
- Capsule → Popout
- Capsule 关闭 → 回收 Tab
- Popout 关闭 → 回收 Tab
- 置顶、吸附、拖动、窗口位置保存

### 1.2 找出旧双窗口边界

明确哪些函数是“创建另一个窗口”的旧路径：

- `restorePopoutToCapsule`
- `restoreCapsuleToPopout`
- `open_capsule`
- `open_note_popout`
- Capsule init / Popout init 的分离逻辑

### 1.3 写出目标状态

建议目标状态：

- `expanded`：便签态，默认最小尺寸 400×300
- `capsule`：胶囊态，240×40
- `transitioning-to-capsule`
- `transitioning-to-expanded`

## Phase 2：新增统一窗口能力，不删除旧路径

### 2.1 Rust 侧新增同窗口形态切换命令

建议新增命令，而不是替换旧命令：

- `set_note_window_mode`
- 或拆成 `collapse_note_window_to_capsule` / `expand_note_window_from_capsule`

### 2.2 命令职责

便签态到胶囊态：

- 记录当前 expanded 几何：x/y/width/height。
- 将当前窗口 resize 到 240×40。
- 根据锚点保持标题视觉位置稳定。
- 设置透明背景，圆角 UI 由前端负责。
- 保持同一个 window label 不变。

胶囊态到便签态：

- 使用记录的 expanded 几何恢复。
- 如果没有记录，则使用默认最小尺寸 400×300。
- 不通过新建窗口恢复。

### 2.3 保留旧路径

保留旧 `CapsuleView` / `PopoutView` 路径。

新命令先只接到实验入口，确保随时能回退。

## Phase 3：让 PopoutView 内部支持胶囊态

### 3.1 增加内部 mode

在 `PopoutView` 增加内部窗口形态状态，例如：

```ts
type WindowMode = "expanded" | "capsule";
```

### 3.2 UI 改造

- `expanded` 使用现有便签 UI。
- `capsule` 使用现有 CapsuleView 的视觉结构，但移植为 PopoutView 内部状态，而不是单独窗口。

### 3.3 动画方式

便签 → 胶囊：

- 内容区淡出或裁切。
- titlebar 高度保持 40。
- 窗口宽高 resize 到 240×40。
- titlebar border-radius 从小圆角变成胶囊圆角。
- 标题字号、位置保持不变，或只做极小过渡。

胶囊 → 便签：

- 同一个窗口 resize 回记录尺寸。
- 胶囊圆角展开成便签标题栏。
- 内容区淡入。
- 标题不发生跳动。

## Phase 4：接入主流程，但保留 fallback

### 4.1 Popout → Capsule 改走新路径

Popout 中的进入胶囊按钮改走新同窗口路径。

原来的 `restorePopoutToCapsule` 暂时保留，但不作为默认路径。

### 4.2 Capsule → Popout 改走新路径

胶囊点击还原便签改走新同窗口路径。

原来的 `restoreCapsuleToPopout` 暂时保留。

### 4.3 增加 fallback 开关

可以用一个常量或配置开关保留旧路径，例如：

```ts
const USE_UNIFIED_NOTE_WINDOW = true;
```

出问题时只需切回 `false`，不用回滚整批代码。

## Phase 5：验证核心行为

### 5.1 几何验证

验证：

- 便签 → 胶囊 → 便签，便签回到原位置和原尺寸。
- 胶囊 → 便签 → 胶囊，胶囊回到原位置。
- 拖动便签后切换，位置正确。
- 拖动胶囊后切换，位置正确。
- 多显示器 / 缩放比例下不漂移。

### 5.2 交互验证

验证：

- 编辑内容保存。
- 标题重命名。
- 颜色标签。
- 置顶。
- 关闭窗口回收 Tab。
- Ctrl+W。
- 胶囊拖动。
- 胶囊吸附，如果当前有吸附逻辑。

### 5.3 视觉验证

验证：

- 不再出现“先消失后出现”。
- 标题位置连续。
- 标题大小稳定。
- 窗口边缘没有白色初始化闪烁。
- 动画过程中没有双影、黑边、错位。

### 5.4 构建验证

至少运行：

```text
npm run build
cargo check
```

## Phase 6：稳定后下线旧路径

满足以下条件后再下线旧路径：

- 新同窗口路径通过 Phase 5 验证。
- 用户验收“变形动画”和“位置不漂移”。
- fallback 开关至少经过一次切换验证。
- 当前分支有可回滚 checkpoint。

### 6.1 移除或停止使用旧命令

下线旧命令：

- `restorePopoutToCapsule`
- `restoreCapsuleToPopout`
- 旧的 capsule 独立窗口创建路径

### 6.2 下线独立 CapsuleView

如果没有其他入口依赖，删除或归档：

- `src/components/CapsuleView.tsx`
- `capsule` 专用 `main.tsx` 分支
- capsule 独立窗口 init state

### 6.3 清理 Rust 状态

移除旧 capsule window registry / init payload / suppression 逻辑中不再需要的部分。

### 6.4 清理权限

如果不再需要独立 capsule window label，更新：

- `src-tauri/capabilities/default.json`

### 6.5 清理 CSS

删除旧跨窗口伪变形动画，只保留同窗口变形动画。

## Phase 7：最终验收与收口

### 7.1 最终构建验证

再次运行：

```text
npm run build
cargo check
```

### 7.2 手工验收清单

- 主窗口拖出 Tab 生成便签。
- 便签变胶囊。
- 胶囊变便签。
- 来回 5 次不漂移。
- 关闭后 Tab 正常回主窗口。
- 置顶状态保持。
- 多个便签窗口互不影响。

### 7.3 更新交接文档

建议新增：

```text
docs/HANDOVER-YYYY-MM-DD-unified-note-window.md
```

内容包括：

- 新窗口模型。
- 旧路径下线说明。
- 回滚方式。
- 已验证项目。
- 仍需观察的问题。

## 回滚策略

如果 Phase 2-4 出现问题：

1. 优先切 fallback 开关回旧双窗口路径。
2. 如果问题影响范围更大，回退到 Phase 0 的 checkpoint。
3. 如果只影响少数文件，用 Phase 0 的文件快照局部恢复。
4. 不做 `git reset --hard`，除非用户明确要求。

## 推荐执行节奏

第一轮新窗口只做到 Phase 0-3：备份完成，并让 PopoutView 内部能进入胶囊态。

第二轮做到 Phase 4-5：接入默认流程并验收。

第三轮确认稳定后再做 Phase 6-7：旧路径下线。
