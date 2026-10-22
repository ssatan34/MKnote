# 设计文档：隐私笔记 & 云端保险库

## 架构概览

两个功能相互独立，共享同一套入口隐蔽哲学：不在主界面留下明显痕迹。

```
隐私笔记
  Ctrl+左键 Logo → App.tsx privateModeActive → CompactView 编辑区渲染 private zone 内容
  点击任意 Tab → 退出私密模式 → 恢复普通笔记内容

云端保险库
  Chat 界面 → 锁形按钮 → Rust vault_verify_password → 解锁状态存内存
  → VaultPanel 渲染（替换消息列表区域）
  → 关闭 Chat 时清空解锁状态
```

---

## 一、隐私笔记 — 实现设计

### 1.1 Rust 后端

**新增 `NoteZone::Private` 变体（`paths.rs`）**

```rust
pub enum NoteZone {
    Inbox,
    Default,
    Private,          // 新增
    Folder(String),
}
```

- `dir()` 返回 `file_root_path(base).join(".private")`
- `as_str()` 返回 `"private"`
- `parse_zone("private")` 解析到 `NoteZone::Private`

**`ensure_app_dirs` 中自动创建 `.private/` 并设置隐藏属性**

```rust
// paths.rs
fn ensure_private_dir(base: &Path) -> Result<(), String> {
    let dir = file_root_path(base).join(".private");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        use winapi::um::fileapi::SetFileAttributesW;
        use winapi::um::winnt::FILE_ATTRIBUTE_HIDDEN;
        // 通过 winapi 设置 FILE_ATTRIBUTE_HIDDEN
        set_hidden_attribute(&dir)?;
    }
    Ok(())
}
```

Windows 隐藏属性设置方案（无需额外 crate，用 `std::process::Command` 调用 `attrib`）：

```rust
#[cfg(windows)]
fn set_hidden_attribute(path: &Path) -> Result<(), String> {
    std::process::Command::new("attrib")
        .arg("+H")
        .arg(path)
        .output()
        .map_err(|e| e.to_string())?;
    Ok(())
}
```

**`notes.rs` 的 `list_notes` / `list_folders` 等命令中过滤 `private` zone**

- 所有面向普通用户的列表命令（`list_notes`, `list_folders`, `list_note_colors`）在解析 zone 时忽略 `private`
- `private` zone 的笔记**不写入** `llms.txt` / `mknote-manifest.json`
- `read_note`、`write_note`、`create_note`、`delete_note` 正常支持 `private` zone

### 1.2 前端状态（`App.tsx`）

新增状态：

```typescript
const [privateModeActive, setPrivateModeActive] = useState(false);
const [privateNote, setPrivateNote] = useState<string | null>(null); // 当前隐私笔记文件名
const [privateContent, setPrivateContent] = useState("");
const [privateContentRevision, setPrivateContentRevision] = useState(0);
const privateNoteRef = useRef<string | null>(null);
const privateContentRef = useRef("");
```

**进入隐私模式（`handleEnterPrivateMode`）**

```typescript
const handleEnterPrivateMode = useCallback(async () => {
    // 1. 先保存当前普通笔记（如果 dirty）
    await flushSave();
    // 2. 从 private zone 加载最近一条笔记，没有则创建
    let notes = await invoke<NoteSummary[]>("list_notes", { zone: "private" });
    if (notes.length === 0) {
        const note = await invoke<NoteSummary>("create_note", { zone: "private" });
        notes = [note];
    }
    const target = notes[0];
    const text = await invoke<string>("read_note", { zone: "private", name: target.name });
    setPrivateNote(target.name);
    setPrivateContent(text);
    privateContentRef.current = text;
    privateNoteRef.current = target.name;
    setPrivateModeActive(true);
    setPrivateContentRevision(n => n + 1);
}, [flushSave]);
```

**退出隐私模式（在 `onSelectTab` 调用前触发）**

```typescript
const exitPrivateMode = useCallback(async () => {
    if (!privateModeActive) return;
    // 保存隐私笔记
    const name = privateNoteRef.current;
    if (name) {
        await invoke("write_note", { zone: "private", name, content: privateContentRef.current });
    }
    setPrivateModeActive(false);
}, [privateModeActive]);
```

### 1.3 CompactView 渲染

`CompactView` 接收新 props：

```typescript
privateModeActive?: boolean;
privateContent?: string;
privateContentRevision?: number;
onPrivateContentChange?: (value: string) => void;
onEnterPrivateMode?: () => void;
```

**Logo 点击处理**（在 CompactView 内的 Logo 元素上）：

```tsx
<div
  className="compact-logo"
  onClick={(e) => {
    if (e.ctrlKey) {
      e.preventDefault();
      onEnterPrivateMode?.();
    } else {
      onToggleLogoMini();
    }
  }}
/>
```

**编辑区内容切换**：

```tsx
// EditablePreviewEditor 的 content 和 onChange 根据 privateModeActive 切换
<EditablePreviewEditor
  content={privateModeActive ? privateContent : content}
  contentRevision={privateModeActive ? privateContentRevision : contentRevision}
  onChange={privateModeActive ? onPrivateContentChange : onContentChange}
  // 其他 props 不变
/>
```

**Tab 点击时先退出隐私模式**：

在 `onSelectTab` 的包装函数中，若 `privateModeActive` 则先调用 `exitPrivateMode` 再执行原 `onSelectTab`。

---

## 二、云端保险库 — 实现设计

### 2.1 Rust 后端（新文件 `src-tauri/src/vault.rs`）

**数据结构**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultEntry {
    pub id: String,
    pub text: String,
    pub created_at_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct VaultStore {
    pub version: u32,
    pub entries: Vec<VaultEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct VaultConfig {
    pub password_hash: Option<String>,  // SHA-256 hex of password
}
```

**S3 object keys**

```rust
const VAULT_NOTES_KEY_SUFFIX: &str = "/vault-notes.json";
const VAULT_CONFIG_KEY_SUFFIX: &str = "/vault-config.json";

// 从 s3_object_key（如 "MDnote/messages.json"）派生前缀 "MDnote"
fn vault_prefix(config: &AppConfig) -> String {
    config.s3_object_key.as_deref()
        .and_then(|k| k.rsplit_once('/'))
        .map(|(prefix, _)| prefix.to_string())
        .unwrap_or_else(|| "MDnote".to_string())
}
```

**密码哈希**

```rust
use sha2::{Sha256, Digest};

fn hash_password(password: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(password.as_bytes());
    format!("{:x}", hasher.finalize())
}
```

（`sha2` crate 已被 reqwest 间接依赖，或直接在 `Cargo.toml` 添加 `sha2 = "0.10"`）

**Tauri 命令**

```rust
// 检查 S3 是否已配置 & 是否已设置密码
#[tauri::command]
pub async fn vault_get_status(app: AppHandle) -> Result<VaultStatus, String>
// VaultStatus { s3_configured: bool, password_set: bool }

// 首次设置密码（前端传原始密码字符串）
#[tauri::command]
pub async fn vault_setup_password(app: AppHandle, password: String) -> Result<(), String>

// 验证密码，成功则返回内容
#[tauri::command]
pub async fn vault_unlock(app: AppHandle, password: String) -> Result<Vec<VaultEntry>, String>

// 添加条目（前端已验证解锁，每次操作需传密码哈希做二次校验）
#[tauri::command]
pub async fn vault_add_entry(app: AppHandle, password: String, text: String) -> Result<Vec<VaultEntry>, String>

// 删除条目
#[tauri::command]
pub async fn vault_delete_entry(app: AppHandle, password: String, id: String) -> Result<Vec<VaultEntry>, String>

// 更新条目
#[tauri::command]
pub async fn vault_update_entry(app: AppHandle, password: String, id: String, text: String) -> Result<Vec<VaultEntry>, String>
```

注意：所有写操作都要求传入 `password`，Rust 侧重新校验，防止前端绕过。

### 2.2 前端（`MessageHubView.tsx`）

**新增状态**

```typescript
const [vaultUnlocked, setVaultUnlocked] = useState(false);
const [vaultEntries, setVaultEntries] = useState<VaultEntry[]>([]);
const [vaultPassword, setVaultPassword] = useState(""); // 内存中持有，关闭时清空
const [showVaultPanel, setShowVaultPanel] = useState(false);
const [vaultPasswordDialog, setVaultPasswordDialog] = useState<
  "none" | "setup" | "unlock"
>("none");
```

**锁形按钮放置位置**

在 `message-hub-compose` 的 textarea 上方，左侧：

```tsx
<div className="message-hub-compose-toolbar">
  <button
    type="button"
    className="vault-open-btn icon-btn"
    title="云端保险库"
    onClick={handleVaultOpen}
  >
    <Icon name="lock_closed" size={15} />
  </button>
</div>
<textarea ... />
```

**`handleVaultOpen` 流程**

```typescript
const handleVaultOpen = async () => {
    const status = await invoke<VaultStatus>("vault_get_status");
    if (!status.s3_configured) {
        onError("请先在设置中配置短消息 S3 才能使用云端保险库");
        return;
    }
    if (!status.password_set) {
        setVaultPasswordDialog("setup");
    } else {
        setVaultPasswordDialog("unlock");
    }
};
```

**Vault 面板关闭时清空状态**

在 `MessageHubView` 的 `active` prop 变为 false 时（Chat 面板关闭），清空：

```typescript
useEffect(() => {
    if (!active) {
        setVaultUnlocked(false);
        setVaultPassword("");
        setShowVaultPanel(false);
        setVaultPasswordDialog("none");
    }
}, [active]);
```

### 2.3 密码对话框设计

密码对话框是内联在 `MessageHubView` 内的小浮层（不使用系统 dialog），样式复用现有 `.message-hub-*` class 风格：

- **Setup 模式**：两个 `<input type="password">` + 「确认设置」按钮
- **Unlock 模式**：一个 `<input type="password">` + 「解锁」按钮
- 错误提示内联显示（"密码错误，请重试"）
- 按 Enter 提交

### 2.4 VaultPanel 子组件

```tsx
function VaultPanel({ entries, password, onLock, onError }) {
  // 纯文本列表，与消息列表相同风格
  // 顶部：「云端私密」标题 + 「锁定」按钮
  // 内容：条目列表（双击编辑、删除、复制）
  // 底部：输入框 + 「添加」按钮
}
```

VaultPanel 渲染在 `.message-hub-list-wrap` 区域上方（叠加），通过条件渲染切换。

---

## 三、文件变更清单

| 文件 | 改动 |
|------|------|
| `src-tauri/src/paths.rs` | 新增 `NoteZone::Private`，`ensure_private_dir`，Windows 隐藏属性 |
| `src-tauri/src/notes.rs` | `list_notes` 等普通列表命令过滤 `private` zone |
| `src-tauri/src/agent_index.rs` | 排除 `private` zone |
| `src-tauri/src/vault.rs` | **新文件**：VaultStore、VaultConfig、所有 vault_* 命令 |
| `src-tauri/src/lib.rs` | 注册 vault_* 命令，mod vault |
| `src-tauri/Cargo.toml` | 添加 `sha2 = "0.10"` |
| `src/types.ts` | 新增 `VaultEntry`、`VaultStatus` 类型 |
| `src/App.tsx` | 新增 `privateModeActive` 状态、`handleEnterPrivateMode`、`exitPrivateMode`，传 props 到 CompactView |
| `src/components/CompactView.tsx` | Logo 加 Ctrl+click 处理，编辑区内容/onChange 根据 privateMode 切换 |
| `src/components/MessageHubView.tsx` | 锁形按钮、密码对话框、VaultPanel 子组件 |
| `src/App.css` | Vault 面板样式、compose-toolbar 样式、密码对话框样式 |

---

## 四、关键约束与边界

1. **私密模式下 Tab 栏绝对不变**：Tab 的 `onSelectTab` 包装一层，先 flush 私密笔记再退出私密模式再切换。
2. **隐私笔记不进入历史记录（undo/redo）**：私密编辑区不调用 `pushHistory`，或使用独立的 history hook 实例（待定，简化实现可先不支持 undo）。
3. **`private` zone 笔记不参与最近打开**：`recordRecentNote` 跳过 `private` zone。
4. **Vault 密码始终在 Rust 校验**：前端不做哈希，原始密码传到 Rust 后计算哈希再比对，防止前端被绕过。
5. **首次打开 private zone 无笔记时自动创建**：文件名格式与普通笔记相同（时间戳 `.md`）。
