---
name: MKnote
colors:
  # --- 核心语义色（默认主题：MKnote 浅色）---
  canvas: "#fefcf7"
  parchment: "#faf7f0"
  pearl: "#f1f5f9"
  hairline: "#e2e8f0"
  divider: "#eceff4"
  ink: "#1e293b"
  muted: "#64748b"
  primary: "#475569"
  primary-focus: "#334155"
  on-primary: "#ffffff"
  icon: "#5a5751"
  success: "#30d158"
  status-error: "#dc2626"
  status-warning: "#d97706"
  selection-bg: "#e2e8f0"
  selection-border: "#475569"

  # --- 品牌 Logo 色 ---
  brand-logo-stroke: "#2e1065"
  brand-logo-accent: "#bef264"
  brand-logo-support: "#a78bfa"

  # --- 笔记颜色标签 ---
  note-tag-important: "#b8860b"
  note-tag-urgent: "#c0392b"
  note-tag-archive: "#475569"
  note-tag-todo: "#0ea5e9"
  note-tag-private: "#8839ef"

  # --- 深色主题（Catppuccin Mocha，默认深色）---
  dark-canvas: "#1e1e2e"
  dark-parchment: "#181825"
  dark-pearl: "#313244"
  dark-hairline: "#45475a"
  dark-ink: "#cdd6f4"
  dark-muted: "#a6adc8"
  dark-primary: "#cba6f7"
  dark-on-primary: "#11111b"
  dark-icon: "#c0c4d8"
  dark-success: "#a6e3a1"

typography:
  display:
    fontFamily: '"SF Pro Display", "San Francisco", -apple-system, BlinkMacSystemFont, system-ui, sans-serif'
    fontSize: 18px
    fontWeight: "600"
    lineHeight: 1.4
    letterSpacing: -0.01em
  body:
    fontFamily: '"SF Pro Text", "San Francisco", -apple-system, BlinkMacSystemFont, system-ui, sans-serif'
    fontSize: 15px
    fontWeight: "400"
    lineHeight: 1.47
  caption:
    fontFamily: '"SF Pro Text", "San Francisco", -apple-system, BlinkMacSystemFont, system-ui, sans-serif'
    fontSize: 12px
    fontWeight: "400"
    lineHeight: 1.4
  editor-default:
    fontFamily: '"SF Pro Text", "San Francisco", -apple-system, BlinkMacSystemFont, system-ui, sans-serif'
    fontSize: 16px
    lineHeight: 1.6
  editor-range:
    min: 12px
    max: 24px
    step: 1px

rounded:
  sm: 8px
  md: 10px
  pill: 9999px

spacing:
  toolbar-width: 44px
  control-size-sm: 32px
  editor-padding-x: 16px
  editor-padding-y: 12px
  icon-toolbar: 16px
  icon-topbar-logo: 20px
  icon-code-action: 14px
  icon-floater-logo: 20px

components:
  top-bar:
    backgroundColor: "{colors.canvas}"
    borderBottom: "1px solid {colors.hairline}"
    height: 40px
    padding: "0 8px"
  toolbar-left:
    backgroundColor: "{colors.canvas}"
    borderRight: "1px solid {colors.hairline}"
    width: "{spacing.toolbar-width}"
    padding: "8px 0"
  editor-area:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    fontSize: "{typography.editor-default.fontSize}"
    lineHeight: "{typography.editor-default.lineHeight}"
    padding: "{spacing.editor-padding-y} {spacing.editor-padding-x}"
  status-bar:
    backgroundColor: "{colors.parchment}"
    borderTop: "1px solid {colors.hairline}"
    height: 28px
    textColor: "{colors.muted}"
    fontSize: 11px
  button-icon:
    backgroundColor: transparent
    textColor: "{colors.icon}"
    rounded: "{rounded.sm}"
    size: 28px
    hover-backgroundColor: "{colors.pearl}"
  button-icon-active:
    backgroundColor: "{colors.pearl}"
    textColor: "{colors.primary}"
  note-list-item:
    backgroundColor: transparent
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "6px 8px"
    hover-backgroundColor: "{colors.pearl}"
    selected-backgroundColor: "{colors.selection-bg}"
    selected-textColor: "{colors.primary}"
  color-dot:
    size: 10px
    rounded: "{rounded.pill}"
    unset-border: "1.5px solid {colors.hairline}"
  color-picker-popup:
    backgroundColor: "{colors.canvas}"
    border: "1px solid {colors.hairline}"
    rounded: "{rounded.md}"
    padding: "8px"
  floater-view:
    backgroundColor: "{colors.canvas}"
    rounded: "{rounded.md}"
    size: 48px
    hover-backgroundColor: "{colors.pearl}"
  toast-success:
    backgroundColor: "#1a3a22"
    textColor: "#a6e3a1"
    border: "1px solid #30d158"
    rounded: "{rounded.sm}"
  toast-error:
    backgroundColor: "#3a1a1a"
    textColor: "#f87171"
    border: "1px solid #dc2626"
    rounded: "{rounded.sm}"
  settings-panel:
    backgroundColor: "{colors.canvas}"
    border: "1px solid {colors.hairline}"
    rounded: "{rounded.md}"
    sectionGap: 16px
  tab-bar:
    backgroundColor: "{colors.parchment}"
    borderBottom: "1px solid {colors.hairline}"
    tabHeight: 32px
    activeIndicatorColor: "{colors.primary}"
---

## Brand & Personality

MKnote（MD Sticky Note）是一款轻量桌面便签应用，服务于「随手记录、快速查阅」的场景。整体气质是**克制而温暖**——不抢占注意力，退居屏幕一角，用柔和的羊皮纸色底和细腻的中灰 accent 传递沉静、可信赖的工具感。

品牌识别色为「紫罗兰酸橙」组合：深紫罗兰描边 `#2E1065`、酸橙角标 `#BEF264`、柔紫辅色 `#A78BFA`，仅用于 Logo，不向界面 UI 渗透。

设计哲学：**功能密度高，视觉噪声低**。紧凑窗口里容纳编辑区、工具栏、资料库、状态栏，靠间距与边框而非色块来划分区域，让 Markdown 内容本身成为视觉焦点。

---

## Colors

MKnote 的配色体系由**主题（light/dark）× 浅色皮肤 × 深色皮肤 × 强调色皮肤**三层叠加构成，通过 CSS `data-*` 属性切换：

- `data-theme`: `system | light | dark`
- `data-light-theme`: `mknote | hermes | catppuccin | poseidon | ares | nous | midnight | ember | mono | slate | captain-log`
- `data-dark-theme`: `mknote | hermes | catppuccin | poseidon | ares | nous | midnight | ember | mono | slate | captain-log`
- `data-accent-skin`: `mknote | hermes | catppuccin | poseidon | ares | nous | midnight | ember | mono | slate | captain-log`

### 默认浅色（MKnote 皮肤）

底色采用微暖的羊皮纸白系列，避免纯白的刺眼感：
- **Canvas** `#fefcf7` — 主编辑背景
- **Parchment** `#faf7f0` — 状态栏、次级面板
- **Pearl** `#f1f5f9` — hover 高亮、选中背景
- **Hairline** `#e2e8f0` / **Divider** `#eceff4` — 分隔线，不做实体感，仅做视觉区隔

主文字 Ink `#1e293b`（Slate 900），辅助文字 Muted `#64748b`（Slate 500）。

Primary accent 为 Slate `#475569`——刻意选择非饱和色，体现工具中性，不与笔记内容竞争注意力。

### 深色（Catppuccin Mocha，默认深色）

深色模式跟随 Catppuccin Mocha 调色板，紫调偏深，保持和浅色同等的「文艺克制」气质：Canvas `#1e1e2e`，Primary `#cba6f7`。

### 主题皮肤变体

| 皮肤 | 定位 | 浅色 Primary | 深色 Primary |
|------|------|-------------|-------------|
| MKnote | 默认，中性 Slate | `#475569` | `#94a3b8` |
| Hermes | 经典金棕，皮革质感 | `#b8860b` | `#ffd700` |
| Catppuccin | 紫调现代 | `#8839ef` | `#cba6f7` |
| Poseidon | 冷色天青，清爽感 | `#0ea5e9` | `#0ea5e9` |
| Ares | 红调，高能量 | `#c0392b` | `#ff4444` |
| Nous | Glass neutrals with Nous blue accents | `#0053fd` | `#ffe6cb` |
| Midnight | Deep blue-violet with cool accents | `#6f64c7` | `#8b80e8` |
| Ember | Warm crimson and bronze — forge vibes | `#c35e1d` | `#d97316` |
| Mono | Clean grayscale — minimal and focused | `#555555` | `#9a9a9a` |
| Slate | Cool slate blue — focused developer theme | `#2f81d1` | `#58a6ff` |
| GBF | Deep-space navy with brass HUD accents | `#d99a45` | `#e7a84f` |

其中 Midnight、Ember、Mono、Slate、GBF 以深色调色板为设计基准；浅色模式使用对应的浅色合成 token。Nous 同时提供独立浅色和深色调色板。新增主题不会移除既有主题，默认主题仍为 MKnote。

### 笔记颜色标签

5 个语义色标签，颜色为中等饱和度，适合在浅/深背景上展示：重要（金）、紧急（红）、存档（灰）、待办（天青）、隐私（紫）。以 10px 色点形式展示在笔记条目左侧，未设置时显示透明占位圆（hairline 描边）。

---

## Typography

MKnote 使用系统字体栈，优先 SF Pro（macOS/iOS），fallback 到系统 sans-serif，使文字在 Windows/macOS 上都有原生质感。

- **显示层**（标题栏、面板标题）：`--mk-font-display`，Semi Bold 600，`-0.01em` 字距
- **文本层**（正文、列表、状态栏）：`--mk-font-text`，Regular 400，`line-height 1.47`
- **编辑区**：用户可调字号 12–24px（步进 1px），默认 16px，行高 1.6，宽松阅读节奏
- **辅助文字/Caption**：12px，Muted 色

图标不使用字体图标库，全部采用 SVG（`viewBox="0 0 24 24"`，`stroke="currentColor"`，`stroke-width="1.5"`），随 CSS `color` 自动适配主题。

---

## Layout & Spacing

窗口默认尺寸 **760×640px**（紧凑模式），小窗工具感。整体分三纵向区域：

```
┌─────────────────────────────────────────────┐
│  顶栏（Logo + 颜色 + 标题 + 工具按钮）  40px  │
├──────┬──────────────────────────────────────┤
│ 左侧  │                                      │
│ 工具  │         编辑 / 预览区                 │
│ 栏   │                                      │
│ 44px │                                      │
├──────┴──────────────────────────────────────┤
│  状态栏（资料库 · 字数 · 行号 · 保存状态）28px │
└─────────────────────────────────────────────┘
```

资料库通过状态栏按钮展开，叠加在编辑区下方，两列（文件夹树 + 笔记列表），不推开编辑区。

**间距基准**：
- 按钮内边距：4–6px（紧凑工具栏风格）
- 图标尺寸：16px（工具栏）、20px（顶栏 Logo）、14px（代码块内联按钮）
- 圆角：`8px`（sm，控件）、`10px`（md，弹窗/面板）、`9999px`（胶囊/色点）
- 边框：`1px solid` hairline/divider，不使用阴影来区隔区域（扁平风格）

---

## Icons

全部 UI 图标为 SVG，设计规范：

- `viewBox="0 0 24 24"`，`fill="none"`，`stroke="currentColor"`
- `stroke-width="1.5"`，`stroke-linecap="round"`，`stroke-linejoin="round"`
- **不写死颜色**，通过父级 CSS `color` + token 控制
- 图标色 token：`--mk-icon`（普通）、`--mk-muted-icon`（次要）、`--mk-primary`（激活/强调）

不使用 `lucide-react` 等第三方图标库（仅 UiPlayground 试验页除外），所有图标均为项目自有 SVG，存放于 `src/assets/icons/`，通过 `<Icon name="..." size={16} />` 组件渲染。

---

## Components

### 顶栏

单行高 40px，左右 8px padding。从左到右：Logo（28×28，可点击切换浮标模式）、颜色圆点（10px，可点击弹出 5 色选择器）、标题输入框（inline edit）、搜索 / 字号 / 编辑预览 / 置顶 / 主题 / 设置 / 关闭按钮。按钮为 28px icon-button，hover 显示 Pearl 背景，`border-radius: 8px`。

### 左侧工具栏

宽 44px，仅图标，竖向排列。hover 规则与顶栏按钮一致。旧待办入口已移除，后续待办采用胶囊形态承载。

### 编辑区

编辑模式为原生 `<textarea>`，预览模式为 Markdown 渲染 DOM。两种模式共享 padding 和行高 token。不渲染内部滚动条（内容自然撑开高度，外层窗口滚动）。

### 资料库（内嵌展开）

两列：左列文件夹 + 颜色标签筛选，右列笔记列表。笔记条目左侧固定显示色点，hover 时出现重命名/删除操作。删除需二次确认（首次点 × → 出现 ✓ × 二次确认组合）。

### 颜色标签选择器

以弹出小卡片形式出现（`border-radius: 10px`，1px hairline 边框，Canvas 背景），排列 5 个 16px 色块 + 一个清除按钮。

### 浮标（Floater）模式

点击 Logo 进入迷你模式，窗口缩为 48×48px 悬浮球，整体可拖拽移动，单击还原编辑界面。浮标区域 hover 时整体高亮（Pearl 背景）。

### Toast 通知

右下角弹出，5 秒自动消失，不提供关闭按钮。成功为深绿背景 `#1a3a22` + 浅绿文字，失败为深红背景 `#3a1a1a` + 浅红文字。`border-radius: 8px`，带 1px 对应色系描边。

### 设置面板

通用 popover 面板，Canvas 背景，hairline 边框，`border-radius: 10px`，内部分组用小标题（caption 样式，muted 色）分隔，不使用卡片嵌套。

---

## Themes

MKnote 支持**跟随系统 / 浅色 / 深色**三种模式，各含多套皮肤：

| 维度 | 选项 |
|------|------|
| 模式 | system / light / dark |
| 浅色皮肤 | MKnote · Catppuccin · Hermes · Poseidon · Ares · Nous · Midnight · Ember · Mono · Slate · GBF |
| 深色皮肤 | MKnote · Catppuccin · Hermes · Poseidon · Ares · Nous · Midnight · Ember · Mono · Slate · GBF |
| 强调色 | MKnote · Catppuccin · Hermes · Poseidon · Ares · Nous · Midnight · Ember · Mono · Slate · GBF |

主题切换仅替换 CSS token 值，不改变任何组件结构或布局。新增 UI 元素只应引用 `--mk-*` token，不得硬编码色值。

主题选择页的跨项目复刻契约、预览数据和参考实现见 [`docs/theme-selection-page-handoff/`](docs/theme-selection-page-handoff/)。

---

## Do / Don't

**Do**
- 使用 `--mk-canvas` / `--mk-ink` 等 token，保持主题一致性
- 图标用 `<Icon name="..." />` 组件，不直接内联 SVG
- 新增颜色标签时同步更新 `--mk-note-color-*` token
- 保持按钮区域紧凑（28–32px），避免视觉噪声

**Don't**
- 不硬编码色值（`#ffffff` 写死而不用 token）
- 不引入 Lucide / Heroicons 等外部图标库到主流程 UI
- 不用阴影（`box-shadow`）做区域分隔，用边框代替
- 不在深色模式下使用浅色模式的固定色值
- 不让窗口外观依赖系统原生边框（Tauri 自定义标题栏）
