---
name: MKnote Theme Selection Page
version: 1.0.0
status: verified-source-contract
scope: appearance-settings-route-content
source_commit: 3009ea2
canvas: "#fefcf7"
ink: "#1e293b"
primary: "#475569"
hairline: "#e2e8f0"
card_radius: "16px"
preview_height: "84px"
---

# MKnote 主题选择页设计契约

## Overview

本契约描述设置页「外观」路由中的主题选择内容：一个主题设置卡片、三种显示模式选择、11 张主题预览卡片和一行当前状态说明。契约以 MKnote 基准提交 `3009ea2` 的源代码为依据，目标是让其他 Agent 在不同项目中复刻同一结构、密度、状态和视觉角色。

本契约不定义目标项目的设置入口、窗口标题栏、导航图标、后端 API 或配置文件格式；这些部分应由目标项目自行接入，但不得改变本页公开的组件和状态契约。

## Evidence and confidence

| 结论 | 证据 | 置信度 |
|---|---|---|
| 页面由 `AppearancePanel`、`ThemeModePicker` 和 `ThemePreviewCard` 组成 | `src/components/compact/UnifiedSettingsPanel.tsx` | Verified |
| 页面使用 3 个模式和 11 个主题，顺序固定 | 同一文件的 `THEME_MODES`、`THEME_STYLES` | Verified |
| 卡片与模式框的尺寸、间距和状态样式 | `src/App.css` 主题选择相关规则 | Verified |
| 预览色和底部状态 accent 分成两套角色 | `THEME_PREVIEW_COLORS`、`themeAccents.ts` | Verified |
| `poseidon` 深色预览 primary 与状态 accent 不同 | 源数据逐项比对 | Observed; 是否为有意差异未确认 |
| 跨项目可达到像素级一致 | 依赖字体、浏览器/WebView、DPI、父级尺寸 | Inferred; 目标项目需用固定环境截图复核 |

## Tokens

### Primitive tokens

| Token | 基准值或来源 | 用途 |
|---|---|---|
| `--mk-canvas` | 当前应用主题的画布色 | 页面和卡片标题标签背景 |
| `--mk-ink` | 当前应用主题的正文色 | 设置标题和结构文字 |
| `--mk-body-muted` | 当前应用主题的弱化文字色 | 当前状态说明 |
| `--mk-muted` | 当前应用主题的次要色 | 未选中模式的继承色 |
| `--mk-primary` | 当前应用主题 primary | 模式标签、激活边框、主题强调 |
| `--mk-primary-focus` | 当前应用主题 focus primary | hover/focus 的边框 |
| `--mk-pearl` | 当前应用主题 pearl | system 模式示意底色 |
| `--mk-parchment` | 当前应用主题 parchment | system 模式示意条纹底色 |
| `--mk-hairline` | 当前应用主题 hairline | 细边框 |
| `--mk-radius-md` | `10px` | 设置卡片和外层面板体系；主题预览卡片自身覆盖为 `16px` |
| `--mk-radius-pill` | `9999px` | 预览图中的横线 |
| `--mk-font-display` | 系统字体 display 栈 | 主题名称标签 |
| `--mk-motion-fast` | 项目 motion token | hover、focus 和选中状态过渡 |

### Theme preview roles

每张卡片从 `theme-preview-data.json` 注入四个局部 CSS 变量：

| 局部变量 | 作用 |
|---|---|
| `--theme-preview-canvas` | 84px 预览画布的背景 |
| `--theme-preview-surface` | 左侧 29% 的次级表面 |
| `--theme-preview-primary` | 卡片边框、标题、第一条横线、选中轮廓 |
| `--theme-preview-auxiliary` | 第二条横线 |

这些局部变量不能被目标项目的全局主题覆盖；它们代表“被预览的主题”，不一定等于当前页面正在使用的主题。

## Themes

### Display modes

| 内部值 | 显示文字 | 行为 |
|---|---|---|
| `system` | `Follow System` | 根据 `prefers-color-scheme: dark` 解析卡片预览的 light/dark 数据 |
| `light` | `Light` | 固定使用 light 预览数据 |
| `dark` | `Dark` | 固定使用 dark 预览数据 |

### Theme registry

主题顺序和内部 key 必须与 `theme-preview-data.json` 一致：

`mknote` → `catppuccin` → `hermes` → `poseidon` → `ares` → `nous` → `midnight` → `ember` → `mono` → `slate` → `captain-log`

`captain-log` 的 UI 显示文字是 `GBF`，内部 key 不得改成 `gbf`。默认主题是 `mknote`。预览色的完整表格不在本文重复维护，以 `theme-preview-data.json` 为唯一序列化数据源。

### Role separation

预览卡片的 `primary` 和底部“当前主题”文字的 accent 是两个角色。当前源实现中 `poseidon` 深色模式的卡片 primary 为 `#0ea5e9`，状态 accent 为 `#38bdf8`。这是已观察到的源行为，目标 Agent 不得在复刻阶段自行合并；如果产品决定统一，需作为独立设计决策记录。

## Typography

| 元素 | 规格 |
|---|---|
| 设置标题 | 使用正文/标题 token，源实现为 `14px`、当前 ink 色 |
| 设置说明 | `12px`，当前 muted 色，上方间距 `2px` |
| `显示模式` legend | `13px`、`600`、当前 ink 色，下方间距 `8px` |
| 模式标签 | `12px`、`500`、当前 primary 色、行高 `1.2` |
| 主题名称 | display 字体、`18px`、`700`、行高 `1.1` |
| 当前状态 | `12px`、行高 `1.4`、当前 body-muted 色 |

不要将主题名称替换成字体图标或图片；文字是可访问名称和视觉标签的一部分。

## Layout and density

### Outer settings shell reference

当目标项目需要复刻包含设置壳的完整视图时，源实现基准为：

- 外层设置面板最大宽度 `860px`，窄屏宽度为 `calc(100vw - 24px)`；
- 外层面板有 `1px` hairline 边框、`10px` 体系圆角、`18px` 背景模糊和 `0 18px 48px rgba(0, 0, 0, 0.16)` 阴影；
- 面板主体为 `180px minmax(0, 1fr)` 两列；
- 左侧导航内边距 `14px 10px`，内容区内边距 `16px`。

### Appearance content

- 内容使用纵向 stack，卡片之间间距 `12px`。
- 设置卡片内边距 `14px 16px`，边框 `1px`，卡片背景为当前 ink 约 `3%` 混合到透明背景。
- 显示模式选择器上边距 `2px`、下边距 `18px`。
- 三个模式选项等宽排列，横向间距 `24px`。
- 模式示意框高度 `48px`，圆角 `7px`。
- 主题预览网格为两列，列间距 `16px`、行间距 `20px`，内边距 `14px 2px 4px`。
- 主题卡片最小高度 `126px`，内边距 `21px 12px 12px`，圆角 `16px`。
- 卡片内的预览画布高度 `84px`，圆角 `11px`；左侧表面占 `29%`，横线区域左偏移 `31%`、右偏移 `12%`。
- 视口宽度不大于 `680px` 时主题网格变为单列。

## Surfaces and elevation

主题卡片默认背景是 `--theme-preview-canvas` 与 `--theme-preview-primary` 的 `92%/8%` 混合；边框是 primary `72%` 与 hairline 的混合。预览画布直接使用 `--theme-preview-canvas`，左侧表面直接使用 `--theme-preview-surface`。

默认状态不使用强阴影分隔区域。hover 时卡片上移 `2px`，增加 `0 8px 18px` 的 primary `18%` 阴影；选中态使用“当前画布色 2px + 主题 primary 4px”的双层轮廓。焦点使用 `2px` primary 轮廓和 `3px` 外偏移。

## Component families

### Action

主题预览卡片是可点击的 button，整张卡片为命中区域。它没有独立的“应用”按钮；选择动作通过 `onThemeChange` 回调交给宿主。

### Form

显示模式使用原生 radio，外层是 `fieldset`，标题是 `legend`。原生 input 视觉隐藏但保持可聚焦和可操作，label 包含文字和示意框。

### Navigation

本包不实现左侧设置路由导航。目标项目如果复刻完整设置壳，应保持外观路由与其他路由相同的 active、focus-visible 和窄屏行为。

### Container/content

`settings-section-stack`、`settings-card`、`settings-card-head` 负责内容分组；主题预览卡片内部由标题标签、预览画布、左侧表面和两/三条横线组成。

### Data display

主题卡片是可选择的数据展示，不是图表。卡片内容只表达主题色角色，不表达真实业务数据。

### Feedback/overlay

本页没有独立的 loading、toast 或确认弹窗。宿主项目若保存失败，应在外层设置系统提供可见错误反馈，不得把失败状态伪装成已选中或已保存。

### Media

本页没有外部图片或位图资源。模式示意和主题缩略图全部由 CSS 和文本构成，便于跨项目复制和缩放。

## State matrices

### Display mode option

| 状态 | 视觉 | 交互/语义 |
|---|---|---|
| default | label primary；示意框 hairline | radio 可选择 |
| hover | 示意框边框变为 primary-focus | 鼠标可点击整个 label |
| focus-visible | 与 hover 相同，必须可见 | 键盘焦点停留在 radio |
| selected | 边框 primary，外加 `2px` primary 混合轮廓；左侧标记 `✓` | radio `checked=true` |
| disabled | N/A；当前源实现没有 disabled 视觉 | 目标项目若新增必须使用明确 disabled token |
| loading | N/A；保存由宿主处理 | 不得移除当前选择语义 |
| error | N/A；宿主在卡片外反馈 | 保存失败不能静默吞掉 |
| empty | N/A；模式列表固定三项 | 不允许空模式 |
| success | N/A；当前源实现用选中态表达选择，不单独显示成功徽章 | 宿主可另行显示成功反馈 |

### Theme preview card

| 状态 | 视觉 | 交互/语义 |
|---|---|---|
| default | 126px 最小高度、primary 混合边框、浮动标题标签 | button，`aria-pressed=false` |
| hover | `translateY(-2px)`，primary 18% 阴影 | 仍保持整卡点击 |
| focus-visible | 2px primary outline，offset 3px | 键盘操作必须可见 |
| selected | 画布色 2px + primary 4px 双层轮廓 | `aria-pressed=true` |
| disabled | N/A；源实现没有禁用主题 | 若目标项目禁用主题，必须降低交互但不能降低文本对比度 |
| loading | N/A；源实现点击后没有卡片内 spinner | 宿主保存过程应由外层反馈 |
| error | N/A；源实现不在卡片内显示错误 | 宿主负责错误消息 |
| empty | N/A；主题 registry 固定且非空 | 缺失 registry 应视为集成错误 |
| success | N/A；选择不代表持久化完成 | 成功状态由宿主保存流程定义 |

## Data Visualization

N/A。主题缩略图是装饰性 UI preview，不是数据可视化：没有坐标轴、数值、趋势、图例或可读数据。不要给横线添加图表语义；主题名称和 button 的 accessible label 才是用户可读信息。

## Accessibility and localization

- 保留 `fieldset`/`legend`、原生 radio、可点击 label 和 button 语义。
- 主题卡片保留 `aria-pressed`，并使用 `使用{主题显示名}主题` 作为 `aria-label`。
- 不要只依赖颜色表达选中态；必须同时保留 `✓`、边框和轮廓。
- `focus-visible` 必须可见；不能用 `outline: none` 抹掉键盘焦点。
- 支持 `prefers-reduced-motion` 时移除卡片上移和非必要过渡。
- 当前界面文案是中英混排：标题和状态为中文，模式名称为 `Follow System`、`Light`、`Dark`，主题名按 registry 展示。目标项目可以翻译可见文字，但内部 key、ARIA 语义和主题顺序不能因此改变。
- 颜色对比度应由目标项目在每个主题和 DPI 下复核；本契约不把未执行的对比度测试写成通过。

## Composition

推荐 DOM 结构：

```text
settings-section-stack
└── settings-card
    ├── settings-card-head
    │   ├── strong: 主题
    │   └── span: 管理应用的主题样式
    ├── fieldset.theme-mode-selector
    │   ├── legend: 显示模式
    │   └── 3 × label.theme-mode-option
    │       ├── input[type=radio]
    │       ├── span.theme-mode-label
    │       └── span.theme-mode-box
    ├── div.theme-preview-grid
    │   └── 11 × button.theme-preview-card
    │       ├── span.theme-preview-label
    │       └── span.theme-preview-canvas
    │           ├── span.theme-preview-surface
    │           └── span.theme-preview-lines
    └── p.appearance-note
```

宿主至少提供以下输入/回调：

```text
mode: system | light | dark
selectedTheme: one of the 11 internal theme keys
onModeChange(mode)
onThemeChange(themeKey)
```

选择主题后的全局 token 应由宿主负责应用；参考组件不假设 Tauri、React context、Redux 或具体配置存储方式。

## Prohibited patterns

- 不要把当前卡片网格改回单一 select/dropdown，并声称仍然是同一设计。
- 不要删除 11 个主题中的任何 key、改变顺序或把 `captain-log` 改成 `gbf`。
- 不要只实现浅色预览；`system`、`light`、`dark` 必须使用对应预览数据。
- 不要以截图替代语义结构、键盘焦点、ARIA 和状态矩阵。
- 不要把 `previewPrimary` 和 `statusAccent` 两个角色强行合并，除非另有明确产品决策。
- 不要将主题选择成功等同于配置持久化成功；必须验证保存和重启恢复。
- 不要引入外部图标、位图或大型组件库来替代本页已有的 CSS 预览。
- 不要硬编码目标项目无法解释的业务 API；业务接入必须留在宿主层。

