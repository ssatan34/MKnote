# MKnote 图标规范与存放位置

> 更新时间：2026-10-08
> 改 UI 图标或应用品牌图标前请先读本文。界面行为规格另见 [MKnote-UI-v2.md](MKnote-UI-v2.md)。

MKnote 使用两套图标体系，职责分离、互不混用：

| 体系 | 格式 | 目录 | 用途 |
|------|------|------|------|
| **应用内 UI 图标** | SVG | `src/assets/icons/` | 按钮、工具栏、顶栏、资料库等界面控件 |
| **系统 / 品牌图标** | PNG / ICO / ICNS | `src-tauri/icons/` | 窗口、安装包、系统托盘、可执行文件图标 |

---

## 一、应用内 UI 图标

### 1.1 文件与代码位置

```
src/
├── assets/
│   ├── icons/              ← 所有 UI 图标源文件（*.svg）
│   └── icon-manifest.json  ← 图标注册表（id、文件名、中文名、优先级）
├── components/
│   ├── Icon.tsx            ← 统一加载与渲染
│   └── CompactIcons.tsx    ← 常用图标的语义化封装
└── App.css                 ← .mk-icon、.compact-logo 等样式
```

`Icon.tsx` 通过 Vite `import.meta.glob` 自动加载 `../assets/icons/*.svg`。文件名中的连字符 `-` 在运行时会映射为下划线 `_` 作为 `id`（例如 `pin-off.svg` → `pin_off`）。

### 1.2 SVG 设计规范

所有 UI 图标应遵循同一视觉语言，与现有图标保持一致：

| 项 | 规范 |
|----|------|
| 画布 | `viewBox="0 0 24 24"` |
| 源尺寸 | 可写 `width="24" height="24"`（运行时由 `Icon` 组件按 `size` 覆盖） |
| 填充 | `fill="none"`（描边图标为主） |
| 描边 | `stroke="currentColor"` |
| 线宽 | `stroke-width="1.5"` |
| 端点 / 连接 | `stroke-linecap="round"`、`stroke-linejoin="round"` |
| 颜色 | **不写死色值**，使用 `currentColor` 继承父级 CSS 颜色 |

**参考示例**（`src/assets/icons/search.svg`）：

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="10.5" cy="10.5" r="5.25"/>
  <path d="m14.4 14.4 4.1 4.1"/>
</svg>
```

品牌 Logo（`logo.svg`）结构相同，但由 `.compact-logo` 单独着色，见下文。

### 1.3 命名约定

| 层级 | 规则 | 示例 |
|------|------|------|
| 文件名 | `kebab-case` | `font-decrease.svg`、`new-note-in-folder.svg` |
| 代码 `id` | `snake_case` | `font_decrease`、`new_note_in_folder` |
| manifest `filename` | 相对 `assets/` 的路径 | `icons/font-decrease.svg` |

### 1.4 注册表（icon-manifest.json）

每个图标必须在 manifest 中登记一条记录：

```json
{
  "id": "search",
  "filename": "icons/search.svg",
  "title_zh": "搜索",
  "priority": "P0"
}
```

| 字段 | 说明 |
|------|------|
| `id` | 与文件名对应的 `snake_case` 标识，供 `<Icon name="..." />` 使用 |
| `filename` | 相对 `src/assets/` 的路径 |
| `title_zh` | 中文用途说明（便于维护与检索） |
| `priority` | `P0` = 核心 UI 必备；`P1` = 次要或遗留场景 |

`IconId` 类型由 manifest 推导，TypeScript 会在编译期校验 `name` 是否合法。

### 1.5 使用方式

**直接使用 `Icon` 组件：**

```tsx
import { Icon } from "./Icon";

<Icon name="search" size={16} />
<Icon name="bold" size={16} className="my-class" />
```

**通过 `CompactIcons` 语义化封装**（顶栏、浮标等常用场景）：

```tsx
import { IconLogoPlaceholder, IconSync, ThemeIcon } from "./CompactIcons";

<IconLogoPlaceholder />   // logo, 20px
<IconSync />                // sync, 16px
<ThemeIcon theme="dark" />  // 按主题切换图标
```

**非 React 场景**（如 `previewDom` 注入 HTML）：

```ts
import { iconSvgHtml } from "./Icon";

const html = iconSvgHtml("copy_code", 14);
```

### 1.6 默认尺寸

| 场景 | 推荐 `size` |
|------|-------------|
| 工具栏、状态栏、资料库 | `16` |
| 顶栏 Logo | `20` |
| 代码块复制 / 展开收起 | `14` |
| 浮标模式 Logo 容器 | 外层 CSS 36×36，内层图标仍 `20` |

未传 `size` 时默认 `16`。

### 1.7 颜色与主题

图标颜色不由 SVG 内联，而由 CSS token 与父级 `color` 控制：

| Token | 用途 |
|-------|------|
| `--mk-icon` | 普通图标默认色 |
| `--mk-muted-icon` | 工具栏等次要图标 |
| `--mk-brand-logo-stroke` | 品牌 Logo 主线条（`#2E1065`） |
| `--mk-brand-logo-accent` | 品牌 Logo 角标强调色（`#BEF264`） |
| `--mk-brand-logo-support` | 品牌 Logo 辅助色（`#A78BFA`） |
| `--mk-logo` | 普通图标化 Logo / 旧样式默认色 |
| `--mk-logo-accent` | 普通图标化 Logo / 旧样式 hover 高亮 |

相关样式类：

- `.mk-icon` — 内联 flex 容器，`color: inherit`
- `.compact-logo` — 28×28 可点击 Logo 区域，hover 切换 accent 色

定义位置：`src/styles/tokens.css`、`src/App.css`。

### 1.8 新增 UI 图标 Checklist

1. 在 `src/assets/icons/` 新增符合 §1.2 规范的 SVG
2. 在 `src/assets/icon-manifest.json` 追加一条记录（`id` 与文件名映射正确）
3. 在组件中使用 `<Icon name="your_id" />`；若多处复用，可加到 `CompactIcons.tsx`
4. `npm run build` 确认 TypeScript 无 `IconId` 类型错误

---

## 二、系统 / 品牌图标

### 2.1 目录与打包配置

所有 Tauri 打包用图标位于 **`src-tauri/icons/`**。

`src-tauri/tauri.conf.json` 中声明：

```json
"icon": [
  "icons/32x32.png",
  "icons/128x128.png",
  "icons/128x128@2x.png",
  "icons/icon.icns",
  "icons/icon.ico"
]
```

目录内还包含 Windows Store 等资源（`Square*.png`、`StoreLogo.png`、`icon.png` 等），由 Tauri / 平台打包流程使用。

### 2.2 各文件用途

| 文件 | 用途 |
|------|------|
| `32x32.png` | **系统托盘**图标（Rust `include_bytes` 内嵌） |
| `128x128.png` | 安装包 / 标准分辨率 |
| `128x128@2x.png` | 高 DPI（256×256 像素） |
| `icon.ico` | Windows 可执行文件、窗口与任务栏图标（多尺寸合一） |
| `icon.icns` | macOS 应用图标（若打包 macOS） |

托盘加载（`src-tauri/src/system.rs`）：

```rust
tauri::image::Image::from_bytes(include_bytes!("../icons/32x32.png"))
```

修改 `32x32.png` 后需重新编译 Rust 方可更新托盘显示。

Windows 窗口由 `src-tauri/src/window_icons.rs` 在创建时从 EXE 的 ICO 资源按窗口 DPI 加载大小图标，并通过 `WM_SETICON` 设置；收到 DPI 变化后重新加载，替换和销毁时释放自有句柄。此路径覆盖主窗口及动态创建的便签、Quick 窗口，避免 Tauri 默认只读取 ICO 第一帧（当前为 16px）后放大显示。大小图标尺寸使用 Windows 的 DPI 系统度量；150% 缩放下为 24px / 48px。

2026-10-08 用户验收通过。隔离 Release 实例验证了主窗口、Quick Todo / Quick Pocket 和模拟的 100% / 125% / 150% / 200% DPI 变化；连续切换 40 次后 USER 句柄保持 40 → 40。正式实例重启后再次核实 150% 的 24px / 48px 图标；真实跨显示器 DPI 切换未单独实测。

回归脚本 `scripts/smoke-window-icons.ps1 -ExePath <exe>` 只接受 ProductName 为 `MDnote Icon Smoke` 的隔离构建；先以 `TAURI_CONFIG={"identifier":"com.sin.md-sticky-note.icon-smoke","productName":"MDnote Icon Smoke"}` 构建，再验证。脚本创建临时配置与数据目录，不测试正式笔记；不传 `-KeepRunning` 时仅停止该脚本启动的隔离进程。

### 2.3 品牌色与生成脚本

5.2.4 源码保留可编辑备用单色母版 `src/assets/brand/logo-monochrome.svg`，尚未接入界面或替换系统图标。

当前品牌为紫粉蓝渐变晶体羽毛，透明母版位于 `src/assets/brand/logo-transparent.png`，不使用白色圆角底板。

`scripts/generate-brand-icons.ps1` 复用 Tauri 导出各平台资源；旧 Python 命令保留为兼容入口：

1. 导出 `32x32.png`、`128x128.png`、`128x128@2x.png`、`icon.png` 与 Store / Square 系列 PNG
2. 生成多尺寸 `icon.ico`（**16 / 20 / 24 / 30 / 32 / 36 / 40 / 48 / 60 / 64 / 72 / 96 / 128 / 256**，每档独立导出后写入 ICO）
3. 生成 `icon.icns`，同步生成应用内 `src/assets/icons/logo.svg`（内嵌同源透明 PNG）

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/generate-brand-icons.ps1
```

更新品牌图标流程：

1. 更新透明母版 `src/assets/brand/logo-transparent.png`
2. 运行 `generate-brand-icons.ps1`，不要分别修改各尺寸图标
3. `npm run tauri build` 验证安装包与托盘

### 2.4 新增 / 更新品牌图标 Checklist

1. 准备正方形透明 PNG 母版，保留羽毛图形及渐变
2. 更新 `src/assets/brand/logo-transparent.png`
3. 运行 `generate-brand-icons.ps1`
4. 本地 `npm run tauri dev` 检查托盘；`npm run build:green` 检查 exe 图标

### 2.5 外部交付规格（自行重绘 Logo 时）

若你在外部工具（Figma / Photoshop / Illustrator）重绘品牌图标，请按下列规格导出并放入 `src-tauri/icons/`，覆盖同名文件后重新打包。

#### 设计画布

| 项 | 要求 |
|----|------|
| 画布比例 | **1:1 正方形** |
| 推荐主稿尺寸 | **1024×1024 px**（或至少 512×512） |
| 安全边距 | 图形主体距四边留 **10%～15%** 留白（Windows 任务栏会裁圆角） |
| 背景 | **透明**（PNG RGBA）；不要留纯白底再导出（任务栏会显得糊） |
| 色彩模式 | sRGB |
| 风格 | 当前品牌：紫粉蓝渐变晶体羽毛；背景透明，不添加白色底板 |

#### 必须交付的文件

| 文件名 | 像素尺寸 | 格式 | 用途 |
|--------|----------|------|------|
| **`icon.ico`** | 内含下表全部尺寸 | ICO（多帧） | **Windows 任务栏 / exe 图标（最重要）** |
| `icon.png` | **512×512** | PNG-32（RGBA） | Tauri 主图标源 |
| `128x128@2x.png` | **256×256** | PNG-32 | 高 DPI |
| `128x128.png` | **128×128** | PNG-32 | 安装包 |
| `32x32.png` | **32×32** | PNG-32 | **系统托盘**（Rust 内嵌） |
| `icon.icns` | 含 16～1024 多档 | ICNS | macOS（可选） |

#### `icon.ico` 内必须包含的帧

Windows 10/11 任务栏会按 DPI 选用不同帧，**缺小帧会放大糊、缺大帧会缩小糊**。请确保 ICO 内至少有：

| 帧尺寸 | 说明 |
|--------|------|
| **16×16** | 100% 缩放任务栏 |
| **20×20** | 125% DPI |
| **24×24** | 150% DPI |
| **32×32** | 200% DPI / 托盘 |
| **48×48** | 部分列表视图 |
| **64×64** | 中等缩略 |
| **128×128** | 高清缩略 |
| **256×256** | 高清任务栏 / Alt+Tab |

导出建议：用 **256×256 主稿**分别缩放生成各档，再合并为单一 `.ico`；不要只放 16px 一帧让系统放大。

#### Windows Store 附加 PNG（可选，Tauri 打包会用到）

| 文件名 | 尺寸 |
|--------|------|
| `Square30x30Logo.png` | 30×30 |
| `Square44x44Logo.png` | 44×44 |
| `Square71x71Logo.png` | 71×71 |
| `Square89x89Logo.png` | 89×89 |
| `Square107x107Logo.png` | 107×107 |
| `Square142x142Logo.png` | 142×142 |
| `Square150x150Logo.png` | 150×150 |
| `Square284x284Logo.png` | 284×284 |
| `Square310x310Logo.png` | 310×310 |
| `StoreLogo.png` | 50×50 |

#### 交付后放置与验证

1. 将文件覆盖到 `src-tauri/icons/`
2. 运行 `npm run tauri build` 或 `npm run build:green` 重新打包
3. 完全退出旧进程后启动新 exe
4. 任务栏仍糊时：先确认运行的是新 EXE，并检查窗口原生大小图标及 DPI；只有仍显示旧图案时，再排查固定快捷方式与图标缓存。

---

## 三、Logo 与 Icon 模式（UI 行为）

顶栏左上角 Logo 是品牌标识；窗口形态切换由 `CompactView`、`PopoutView` 与 `CapsuleView` 的窗口 label 路由负责（详见 [MKnote-UI-v2.md](MKnote-UI-v2.md)）。
- 文件夹列表**不提供**前置文件夹图标（已移除）

Logo 使用 `IconLogoPlaceholder`（`name="logo"`），样式由 `.compact-logo` 控制。

---

## 四、易混淆路径（请勿混用）

| 路径 | 实际用途 |
|------|----------|
| `src/assets/icons/` | 应用 UI 控件图标（SVG） |
| `src-tauri/icons/` | 操作系统级 / 安装包 / 托盘图标（位图） |
| `File/assets/` | 用户笔记中**拖拽导入的图片**，与 UI 图标无关 |

---

## 五、其他说明

- 主流程 UI **不使用** `lucide-react`；依赖项中的 lucide 仅用于 `UiPlayground.tsx` 试验页。
- 完整已注册图标列表见 `src/assets/icon-manifest.json`（当前约 70 个）。
- 改主题色时，UI 图标随 CSS token 自动适配；品牌位图需重新运行 `generate-brand-icons.py` 或手动改图。

---

**相关文档**：[MKnote-UI-v2.md](MKnote-UI-v2.md) · [AGENT-HANDOVER.md](AGENT-HANDOVER.md) · [PROJECT-SUMMARY.md](PROJECT-SUMMARY.md)

## 六、来源与许可证

2026-10-22 完成当前源码树的 SVG 来源登记，见 [完整清单](../LICENSES/svg-provenance.json) 与 [第三方声明](../THIRD_PARTY_NOTICES.md)。

- 现有 IconPark 衍生图标保留对应来源，适用 Apache-2.0；三个对齐图标来自 Remix Icon v4.6.0，适用 Apache-2.0。
- AI 星光图标来自 Heroicons，适用 MIT；脚本闪电来自 Feather，适用 MIT。
- 26 个无法充分确认历史来源的 UI 图标换为已声明来源的 Lucide / Heroicons 同义图标；保留全部文件名和调用 ID。局部线宽与行列增删、百叶帘开关状态有适配，完整修改说明见清单。
- 两份置顶动画 SVG 中的关闭图钉同步采用 Lucide，动画时间线不变。
- 羽毛品牌素材由项目所有者确认可以随项目公开。未使用的脚手架 Logo SVG 已从当前源码树移除，HTML favicon 改用 MKnote 羽毛 Logo。

新增或替换图标时，应同时记录来源、版本、完整许可证副本及修改说明；不要根据视觉相似或网上下载页面的简短标签猜测许可证。
