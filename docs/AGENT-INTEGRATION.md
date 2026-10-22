# MKnote 外部 AI Agent 接入指南

> 面向 Cursor、Codex、Claude Code、自建脚本等**应用外**的 AI Agent。  
> MKnote 是轻量 Markdown 桌面便签，不是知识库；接入方式是**读索引 + 操作本地 `.md` 文件**。

开发 MKnote 本身请读 [AGENT-HANDOVER.md](AGENT-HANDOVER.md)。

---

## 1. 能做什么、不能做什么

| 支持 | 不支持（当前版本） |
|------|-------------------|
| 列出、读取、创建、修改、删除、移动便签（`.md`） | HTTP/REST 官方 API |
| 通过机器可读索引发现笔记 | 官方 MCP Server |
| 设置/清除笔记颜色标签（JSON 元数据） | 远程双向云同步 |
| 遵守 `llms.txt` 中的安全规则 | 从外部直接调用 Tauri `invoke` |
| 应用内 UI 可上传当前便签到思源（见 [SIYUAN-INTEGRATION.md](SIYUAN-INTEGRATION.md)） | Agent 脚本无法代替 UI 调思源 API |

应用内 UI 的增删改与 Agent 的文件操作**共用同一套磁盘数据**；无单独「Agent 数据库」。

---

## Quick 共享文件（5.2.4）

- Quick Todo 和 Quick Pocket 可在软件设置中分别指定数据目录，重启生效；不要假设它们仍位于程序 inbox。普通便签路径保持原规则。
- Quick Todo 可见且空闲时每 2 秒重读文件；本地写入和在途读取期间延后轮询，外部读取不广播 Tauri 事件也可刷新。Pocket 未新增外部轮询。
- Allnote Work 使用稳定的 `allnote_work_` ID 和 `allnoteWork` v1 元数据，经现有外部写入流程单向更新文件；MDnote 只读展示这些条目，编辑或完成应在来源笔记进行。本版本不部署外部汇总脚本，不反向写回 Allnote。
- 来源入口仅允许 Allnote 库内 `20 工作/` 下的 Markdown 笔记；拒绝其他协议、其他库与路径穿越。手工任务继续由 MDnote 编辑。

## 2. 快速开始（3 步）

1. **找到数据根目录 `{base}`**  
   - 打开 `{base}/mknote-manifest.json`，读字段 `base_path`（最可靠）。  
   - 或读 `{base}/config.json`（exe 同级）中的 `inbox_dir` / `data_dir` 推断。  
   - 开发 `npm run tauri dev` 时，多在：  
     `src-tauri/target/debug/`（与 debug exe 同级）。

2. **读规则与索引**  
   - `{base}/llms.txt` — 目录含义、元数据说明、安全规则（程序自动生成，可覆盖）。  
   - `{base}/mknote-manifest.json` — 文件夹与笔记清单（程序自动生成，可覆盖）。

3. **按 manifest 中的 `path` 读写 `.md`**  
   - 相对路径均相对于 `{base}`，例如 `File/default/20250603120000123.md`。

索引在 MKnote **启动**以及**资料库内增删改移**后会刷新。Agent 直接改文件后，manifest 可能短暂过时；打开 MKnote 或在应用里做一次列表刷新操作后会更新。Agent 也可自行以磁盘为准，不依赖 manifest。

---

## 3. 目录与 zone

### 3.1 物理目录

```
{base}/
├── llms.txt                    # Agent 说明（自动生成）
├── mknote-manifest.json        # 笔记索引（自动生成）
├── inbox/                      # 收件箱
└── File/
    ├── .mknote-note-colors.json   # 笔记颜色标签
    ├── .mknote-folders.json       # 文件夹遗留元数据
    ├── default/                   # 默认区
    └── <folder-name>/             # 用户新建的文件夹
```

### 3.2 zone 与路径对照

| zone（manifest / 逻辑） | 磁盘目录 |
|-------------------------|----------|
| `inbox` | `{base}/inbox/` |
| `default` | `{base}/File/default/` |
| `folder:<文件夹名>` | `{base}/File/<文件夹名>/` |

当前版本使用绿色版固定目录：`inbox_dir` 为 `{base}/inbox`，`data_dir` 为 `{base}/File/default`。`config.json` 中的两个字段是兼容性记录，由启动流程对齐到上述路径，不支持通过 Agent 或设置界面迁移到外部目录。

### 3.3 列表标题规则

- UI 与 manifest 中的 `title` = **文件名去掉 `.md`**。  
- **不是** Markdown 一级标题 `# ...`。  
- 用户「重命名标题」= 重命名 `.md` 文件。

---

## 4. 机器可读索引 `mknote-manifest.json`

### 4.1 顶层结构

```json
{
  "generated_at_ms": 1730000000000,
  "base_path": "D:\\MDnote\\src-tauri\\target\\debug",
  "folders": [
    { "id": "工作", "title": "工作", "zone": "folder:工作" }
  ],
  "notes": [
    {
      "name": "20250603120000123.md",
      "title": "20250603120000123",
      "zone": "default",
      "path": "File/default/20250603120000123.md",
      "color": "重要",
      "modified_ms": 1730000000000,
      "is_todo": false
    }
  ]
}
```

### 4.2 字段说明

| 字段 | 含义 |
|------|------|
| `generated_at_ms` | 索引生成时间（Unix 毫秒） |
| `base_path` | 数据根目录绝对路径 |
| `folders[].id` | 文件夹目录名（`File/<id>/`） |
| `folders[].zone` | 固定为 `folder:<id>` |
| `notes[].name` | 文件名，**含** `.md` |
| `notes[].path` | 相对 `{base}` 的路径，用于读写 |
| `notes[].zone` | `inbox` / `default` / `folder:...` |
| `notes[].color` | 颜色标签，无则为 `null` |
| `notes[].is_todo` | 兼容旧字段；当前版本恒为 `false` |

### 4.3 实现位置

- 生成逻辑：`src-tauri/src/agent_index.rs`  
- 刷新命令：`refresh_agent_index`（应用内调用；外部 Agent 无法直接 invoke）

---

## 5. CRUD 操作（文件系统级）

以下操作与 MKnote 内 Tauri 命令效果一致，供外部 Agent 直接实现。

### 5.1 读（Read）

```text
完整路径 = {base_path} / {note.path}
```

用任意工具读取 UTF-8 文本即可。大文件无特殊分块协议。

**应用内等价命令**：`read_note(zone, name)`，`name` 含 `.md`。

### 5.2 增（Create）

**方式 A — 与应用一致（推荐）**

1. 在目标 zone 对应目录下创建文件。  
2. 文件名：`YYYYMMDDHHmmssSSS.md`（本地时间，毫秒 3 位），例如 `20250603143052123.md`。  
3. 初始内容可为单个换行 `\n` 或空字符串。

| zone | 目录 |
|------|------|
| `inbox` | `{base}/inbox/` |
| `default` | `{base}/File/default/` |
| `folder:名称` | `{base}/File/名称/` |

**方式 B — 自定义文件名**

- 使用 `标题.md`，`标题` 不能为空。  
- 禁止字符：`\ / : * ? " < > |`，且不得包含 `..`。  
- 若与已有文件冲突，应用重命名时会加随机后缀；Agent 自行处理重名。

**应用内等价命令**：`create_note(zone)` → 返回新 `NoteSummary`。

### 5.3 改（Update）

| 需求 | 做法 |
|------|------|
| 改正文 | 覆盖对应 `.md` 全文 |
| 改标题 | 将 `old.md` 重命名为 `新标题.md`（见文件名规则） |
| 改颜色 | 编辑 `File/.mknote-note-colors.json`（见 §6） |

**应用内等价命令**：`write_note`、`rename_note`。

### 5.4 删（Delete）

1. 删除 `{base}/{path}` 对应文件。  
2. 若存在颜色标签，从 `.mknote-note-colors.json` 删除键 `{zone}::{name}`（`name` 含 `.md`）。  
3. 谨慎删除任何用户便签；旧 `待办事项.md` 若存在，按普通 Markdown 便签处理。

**应用内等价命令**：`delete_note(zone, name)`。

### 5.5 移（Move）

1. 将 `.md` 从源 zone 目录移动到目标 zone 目录（同文件名或按需重命名）。  
2. 若有颜色：将 JSON 中 `fromZone::name` 改为 `toZone::name`（键名中的 zone 与 manifest 一致）。

**应用内等价命令**：`move_note(fromZone, toZone, name)`。

### 5.6 文件夹（可选）

| 操作 | 做法 |
|------|------|
| 新建文件夹 | 在 `{base}/File/` 下创建 `<folder-name>/` 目录 |
| 重命名文件夹 | 重命名 `File/<old>/` 为 `File/<new>/`；manifest 中 `folder:<id>` 的 `id` 即目录名 |

应用限制：最多 8 个文件夹（见 `notes.rs`）。Agent 批量创建时注意上限。

---

## 6. 元数据文件

### 6.1 笔记颜色 `File/.mknote-note-colors.json`

```json
{
  "notes": {
    "default::20250603120000123.md": "重要",
    "inbox::草稿.md": "紧急"
  }
}
```

- 键：`{zone}::{文件名}`，例如 `folder:工作::会议.md`。  
- 值：`重要` | `紧急` | `存档` | `待办` | `隐私`（旧版英文/主题色 ID 会在读取时自动迁移）。  
- 清除颜色：删除对应键。

移动/重命名笔记时，请同步更新键名（应用内 `move_note` / `rename_note` 会处理）。

### 6.2 文件夹元数据 `File/.mknote-folders.json`

遗留用途，UI 已不再提供文件夹颜色设置。**不要随意删除**；一般 Agent 无需修改。

### 6.3 应用配置 `%AppData%\md-sticky-note\config.json`

与便签内容无关，记录窗口、主题、`data_dir`、`inbox_dir`、`last_note` 等。  
Agent 通常**不需要**修改；除非用户要求切换数据目录。

---

## 7. 旧待办文件兼容

旧版本可能在 `File/default/待办事项.md` 留下 Markdown 内容和 HTML 注释。当前版本不再自动创建它，也不再提供专用待办 UI；外部 Agent 只需把它当普通 `.md` 便签读写。

1. 保留用户已有内容，不因功能下线而自动删除旧文件。
2. 如果要整理旧注释块，先读懂格式并小范围编辑。
3. 新任务不要继续写入旧 `mknote-todo` 专用结构。

---

## 8. 安全与风格约定

摘自自动生成的 `llms.txt`，Agent 应默认遵守：

1. **先读再改**；大范围修改前备份或确认路径。  
2. 正文以 **Markdown** 为主；避免注入复杂 HTML（预览编辑会 turndown 回写）。  
3. 文件名保持 `.md` 后缀；避免 Windows 非法字符。  
4. **谨慎删除**；删除后等 MKnote 刷新 manifest，或自行维护清单。  
5. 旧 `待办事项.md` 若存在，按普通 Markdown 便签处理。
6. MKnote 不是 Obsidian：GFM 子集即可，不保证复杂 HTML / 插件语法。

---

## 9. 在 Cursor / Codex 中配置

### 9.1 工作区

将 `{base}` 加入工作区，或单独打开该文件夹，便于 Agent 使用 Read/Write/Grep 工具。

### 9.2 规则片段（可复制到 `.cursor/rules` 或 `AGENTS.md`）

```markdown
## MKnote 便签数据

- 数据根目录：`<填写 base_path>`
- 操作前阅读：`<base>/llms.txt`
- 列表索引：`<base>/mknote-manifest.json`
- 便签即 `.md` 文件；zone 见 docs/AGENT-INTEGRATION.md
- 勿破坏 `File/default/待办事项.md` 中的 HTML 注释元数据
```

### 9.3 任务提示词示例

| 任务 | 提示 |
|------|------|
| 列出最近修改 | 读 `mknote-manifest.json`，按 `modified_ms` 排序 |
| 总结某文件夹 | 筛选 `zone` 为 `folder:xxx` 的 notes，逐文件读取 |
| 新建便签 | 在指定 zone 目录创建时间戳 `.md` 并写入内容 |
| 归档到 inbox | `move` 文件到 `inbox/`，并更新颜色 JSON 键名 |

---

## 10. 应用内命令对照表（仅供理解）

外部 Agent **不能**直接调用；若未来做 CLI/MCP 桥接，可封装下表：

| Command | 用途 |
|---------|------|
| `list_notes` | `{ zone }` → 笔记列表 |
| `read_note` / `write_note` | 读写内容 |
| `create_note` / `rename_note` / `delete_note` / `move_note` | CRUD |
| `list_folders` / `create_folder` / `rename_folder` | 文件夹 |
| `list_note_colors` / `list_notes_by_color` / `set_note_color` | 颜色（全库统计 / 按色列笔记 / 设置） |
| `refresh_agent_index` | 重写 `llms.txt` 与 `mknote-manifest.json` |

注册位置：`src-tauri/src/lib.rs` → `generate_handler!`。

---

## 11. 故障排查

| 现象 | 可能原因 | 处理 |
|------|----------|------|
| 找不到 manifest | MKnote 未启动过或 `{base}` 不对 | 先运行一次应用，或读 `config.json` |
| UI 列表与 Agent 不一致 | manifest 未刷新 | 打开 MKnote 或触发资料库操作；Agent 以磁盘为准 |
| 重命名失败 | 非法字符或重名 | 检查 `sanitize_md_filename` 规则 |
| 旧待办内容不再显示专用界面 | 旧 todo 功能已移除 | 按普通 Markdown 便签读取；后续待办方向为胶囊待办 |
| dev / release 路径不同 | exe 目录不同 | 以当前环境的 `base_path` 为准 |

---

## 12. 后续扩展（未实现）

README / [PROJECT-SUMMARY.md](PROJECT-SUMMARY.md) 中的后续规划可能包括：

- Git / 云盘同步
- 思源笔记 API 上传  
- 官方 HTTP API 或 MCP Server  

有需求时可在本仓库新增 `tools/mknote-mcp` 或 CLI，内部复用 `notes.rs` 逻辑或继续文件级封装。

---

## 13. 相关文档

| 文件 | 内容 |
|------|------|
| [AGENT-INTEGRATION.md](AGENT-INTEGRATION.md) | 本文 |
| [AGENT-HANDOVER.md](AGENT-HANDOVER.md) | 开发交接、Tauri 命令全表 |
| [MKnote-UI-v2.md](MKnote-UI-v2.md) | UI 行为规格 |
| [../AGENTS.md](../AGENTS.md) | 仓库 Agent 入口 |
| [PROJECT-SUMMARY.md](PROJECT-SUMMARY.md) | 项目总结、里程碑与迭代指南 |

---

**建议 Agent 每次会话开头**：读 `{base}/llms.txt` → 读 `mknote-manifest.json` → 再执行用户任务。
