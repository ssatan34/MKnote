# MKnote 主题选择页复刻包

- 基准项目：MKnote（MD Sticky Note）
- 基准提交：`3009ea2`（2026-09-08）
- 产物日期：2026-09-08
- 当前状态：可交给其他 Agent 实施；源代码和前端构建已核对
- 适用范围：设置页「外观」路由中的主题选择内容，不包含目标项目自己的设置入口、窗口壳和持久化框架

## 结论

这套设计适合跨项目共享。它不是只依赖截图，而是由稳定的 React 结构、CSS token、11 个主题的预览数据、响应式规则和可访问性状态组成，因此可以作为其他项目的实施契约。

但不能对未知项目承诺脱离环境的“像素级 100%”。字体、WebView/浏览器版本、Windows 缩放比例、父级设置面板尺寸和目标项目的主题 token 如果不同，最终像素会出现差异。本包可以把“结构、尺寸、颜色角色、状态和交互”固定下来；目标 Agent 仍需完成目标项目的 token 映射、保存逻辑和运行时验收。

## 给其他 Agent 的使用顺序

1. 先阅读本目录的 `DESIGN.md`，它是本页的视觉和交互契约。
2. 读取 `theme-preview-data.json`，不要凭记忆重建主题名、顺序或预览色。
3. React 项目优先以 `theme-selection-reference.tsx` 和 `theme-selection-reference.css` 为实现基线；其他技术栈按同一 DOM 结构和 CSS 规则迁移。
4. 先做静态视觉复刻，再接入目标项目的主题应用与持久化；不要用临时状态代替保存成功。
5. 按 `DESIGN.md` 的状态矩阵和本文末尾验收清单逐项验收。

## 包内文件

| 文件 | 用途 |
|---|---|
| `DESIGN.md` | Agent 可读的设计契约、证据等级、尺寸、状态和禁止事项 |
| `theme-preview-data.json` | 11 个主题的内部 key、显示名、浅/深色预览色和 accent 色 |
| `theme-selection-reference.tsx` | 不依赖 MKnote 业务代码的 React 参考实现 |
| `theme-selection-reference.css` | 主题模式选择器和主题预览卡片的可移植 CSS |
| `reference-preview.html` | 不依赖构建工具即可打开的交互式视觉参考页 |

## 源实现映射

以下是本包生成时读取的源实现。目标项目不需要保留这些路径，但需要理解它们各自承担的职责：

| 源文件 | 复刻依据 |
|---|---|
| `src/components/compact/UnifiedSettingsPanel.tsx` | `AppearancePanel`、`ThemeModePicker`、`ThemePreviewCard`、主题列表和预览数据 |
| `src/App.css` | 设置面板壳、卡片、模式选择器、预览卡片的尺寸和状态样式 |
| `src/constants/themeAccents.ts` | 当前状态说明文字使用的浅/深色 accent |
| `src/styles/tokens.css` | `--mk-*` 语义 token 及主题 token |
| `src/services/configService.ts`、`src/App.tsx` | 主题模式/样式保存回调的业务边界 |
| `src-tauri/src/lib.rs` | 主题 key 的后端白名单和配置持久化约束 |
| `docs/主题扩展与白名单同步记录.md` | 新增主题时必须同步前端、token 和后端白名单的历史结论 |

## 不要误用的旧实现

`src/components/ThemeSelect.tsx` 仍保留一个旧的下拉选择组件。当前设置页的主要实现是 `UnifiedSettingsPanel.tsx` 中的卡片网格：

- 显示模式：`Follow System` / `Light` / `Dark` 三选一；
- 主题样式：11 张两列预览卡片；
- 当前状态：底部显示当前模式和主题名称。

复刻当前设置页时，以本目录参考组件和 `AppearancePanel` 为准，不要把旧下拉组件当作页面布局依据。

## 目标项目必须补齐的业务适配

参考组件只负责页面呈现和回调，不包含目标项目的业务存储。接入时必须明确：

- `mode` 的来源，以及 `system` 如何通过 `matchMedia("(prefers-color-scheme: dark)")`解析；
- 主题卡片选中后是否立即更新全局主题 token；
- `onModeChange` 和 `onThemeChange` 是否真正写入配置，并在失败时保留可见错误；
- 重新启动后是否仍能恢复 `themeMode`、浅色主题、深色主题和 accent skin；
- 如果目标项目有后端白名单，11 个内部 key 必须全部允许保存，尤其是 `captain-log`。

主题卡片选中态只代表当前 UI 状态，不等价于持久化成功。

## 当前证据边界

- 已验证：源组件、CSS、主题预览数据和文档已读取；`npm.cmd run build` 在基准提交上通过。
- 已验证：11 个主题的内部 key、显示名和当前预览色已从源代码整理到本包。
- 未在本轮声称：目标项目上的像素级截图一致、不同 DPI 下的尺寸一致、Owner 对跨项目移植结果的人工验收。
- 待目标 Agent 验证：目标项目的字体加载、外层设置面板宽高、持久化成功、重启恢复和真实键盘焦点表现。

## 最小验收清单

- [ ] 宽度大于 `680px` 时主题卡片为两列，卡片间距为横向 `16px`、纵向 `20px`。
- [ ] 宽度不大于 `680px` 时主题卡片切换为单列。
- [ ] 显示模式有 3 个原生 radio，选中标记为 `✓`，未选中标记为 `−`。
- [ ] 浅色、深色、跟随系统的示意框分别保留当前的分割方式和高度 `48px`。
- [ ] 11 张卡片顺序与 JSON 一致；`captain-log` 的显示文字是 `GBF`。
- [ ] 主题卡片默认高度不低于 `126px`，预览画布高度 `84px`，标题标签位于卡片上方。
- [ ] 主题卡片 hover 上移 `2px`；键盘 focus 有可见轮廓；选中态有双层强调色轮廓。
- [ ] 使用键盘可以在模式和主题卡片之间移动并触发选择。
- [ ] `aria-pressed`、`aria-label`、`fieldset/legend` 等语义仍然存在。
- [ ] 浅/深模式切换后预览数据跟随实际外观模式变化。
- [ ] 主题保存失败时不会显示“已保存”的假状态；重启后仍能恢复选择。
- [ ] 在目标项目的固定 viewport、字体和 DPI 下截图对比，并记录实际运行环境。
