# 实施任务：隐私笔记 & 云端保险库

## 任务一：隐私笔记 — Rust 后端

### Task 1.1 — 新增 `NoteZone::Private` 并创建隐藏文件夹
- [ ] `paths.rs`：在 `NoteZone` enum 添加 `Private` 变体
- [ ] `paths.rs`：`NoteZone::Private` 的 `dir()` 返回 `file_root_path(base).join(".private")`
- [ ] `paths.rs`：`NoteZone::Private` 的 `as_str()` 返回 `"private"`
- [ ] `paths.rs`：`parse_zone("private")` 解析到 `NoteZone::Private`
- [ ] `paths.rs`：新增 `ensure_private_dir(base)` 函数，创建目录并调用 `attrib +H`（Windows）
- [ ] `paths.rs`：在 `ensure_app_dirs` 中调用 `ensure_private_dir`

### Task 1.2 — 普通列表命令排除 `private` zone
- [ ] `notes.rs`：`list_notes` 命令在 zone 为 `private` 时正常执行（隐私模式内部用），但 `list_folders` 不暴露 `.private` 文件夹
- [ ] `notes.rs`：检查 `list_all_notes`（如有）排除 `private` zone
- [ ] `agent_index.rs`：生成 `llms.txt` / `mknote-manifest.json` 时跳过 `private` zone
- [ ] `lib.rs`：`record_recent_note` 命令中，若 zone == "private" 直接返回不记录

---

## 任务二：隐私笔记 — 前端

### Task 2.1 — App.tsx 新增私密模式状态
- [ ] 新增 `privateModeActive` / `privateNote` / `privateContent` / `privateContentRevision` 状态和对应 ref
- [ ] 实现 `handleEnterPrivateMode`（加载或创建 private zone 笔记，切换状态）
- [ ] 实现 `exitPrivateMode`（保存隐私笔记，清除私密状态）
- [ ] 包装 `onSelectTab`：若 `privateModeActive` 则先 `exitPrivateMode` 再执行原逻辑
- [ ] 隐私笔记的保存（防抖 600ms）：仿照普通笔记的 `debouncedSave`，私密内容变更时也触发保存

### Task 2.2 — CompactView / Logo 入口
- [ ] `CompactView.tsx`：Logo 元素（`.compact-logo` 或对应 div）的 `onClick` 中处理 `e.ctrlKey`，调用 `onEnterPrivateMode`
- [ ] `CompactView.tsx`：新增 props：`privateModeActive`, `privateContent`, `privateContentRevision`, `onPrivateContentChange`, `onEnterPrivateMode`
- [ ] `CompactView.tsx`：将 `EditablePreviewEditor` 的 `content` / `contentRevision` / `onChange` 根据 `privateModeActive` 切换

---

## 任务三：云端保险库 — Rust 后端

### Task 3.1 — 新建 `vault.rs`
- [ ] 定义 `VaultEntry`、`VaultStore`、`VaultConfig`、`VaultStatus` 结构体
- [ ] 实现 `hash_password(password: &str) -> String`（SHA-256 hex）
- [ ] 实现从 S3 读写 `vault-config.json` 和 `vault-notes.json` 的辅助函数
- [ ] 实现 `vault_prefix(config: &AppConfig) -> String`（从 s3_object_key 派生前缀）
- [ ] 实现 Tauri 命令：`vault_get_status`、`vault_setup_password`、`vault_unlock`
- [ ] 实现 Tauri 命令：`vault_add_entry`、`vault_delete_entry`、`vault_update_entry`
- [ ] 所有写操作在 Rust 侧重新校验密码哈希

### Task 3.2 — 集成到 `lib.rs`
- [ ] `lib.rs`：`mod vault;`
- [ ] `lib.rs`：在 `.invoke_handler` 中注册所有 `vault_*` 命令
- [ ] `Cargo.toml`（src-tauri）：添加 `sha2 = "0.10"`

---

## 任务四：云端保险库 — 前端

### Task 4.1 — types.ts
- [ ] 新增 `VaultEntry` 接口：`{ id: string; text: string; created_at_ms: number }`
- [ ] 新增 `VaultStatus` 接口：`{ s3_configured: boolean; password_set: boolean }`

### Task 4.2 — MessageHubView.tsx
- [ ] 在 `message-hub-compose` 的 textarea 上方添加 toolbar 行，放置锁形按钮（`lock_closed` icon）
- [ ] 新增 `vaultUnlocked`、`vaultEntries`、`vaultPassword`、`showVaultPanel`、`vaultPasswordDialog` 状态
- [ ] 实现 `handleVaultOpen`：调用 `vault_get_status`，按结果决定弹 setup/unlock 对话框或提示未配置 S3
- [ ] 实现密码对话框（内联 JSX，setup 模式和 unlock 模式）
- [ ] 实现 `VaultPanel` 子组件（列表、双击编辑、删除、复制、添加输入框）
- [ ] 在 `active` prop 变为 false 时的 useEffect 中清空所有 vault 状态
- [ ] Vault 面板的「锁定」按钮清空 vault 状态

### Task 4.3 — 样式
- [ ] `App.css`：`.message-hub-compose-toolbar`（按钮行，与 textarea 上方）
- [ ] `App.css`：`.vault-open-btn` 样式（小图标按钮，视觉低调）
- [ ] `App.css`：`.vault-panel`、`.vault-panel-header`、`.vault-entry`、`.vault-entry-actions` 等
- [ ] `App.css`：`.vault-password-dialog`（密码输入对话框，内联浮层风格）

---

## 验收标准

### 隐私笔记
- [ ] `File/.private/` 目录在 Windows 资源管理器中显示为隐藏
- [ ] Ctrl+左键点击 Logo 可以进入隐私模式，编辑区内容切换为私密笔记内容
- [ ] Tab 栏标题、顶部标题栏、状态栏在进入/退出隐私模式时**不发生任何变化**
- [ ] 点击任意 Tab 退出隐私模式，私密内容已保存，编辑区恢复对应 Tab 的内容
- [ ] 隐私笔记不出现在资料库、最近打开、Agent 索引中

### 云端保险库
- [ ] 未配置 S3 时点击锁形按钮显示提示，不弹密码框
- [ ] 首次使用弹出设置密码对话框，两次输入一致后完成设置并解锁
- [ ] 后续打开弹出输入密码对话框，密码正确后显示 VaultPanel，错误则提示
- [ ] VaultPanel 支持新增、复制、双击编辑、删除条目
- [ ] 关闭 Chat 面板后再次打开，VaultPanel 不再显示（需重新输密码）
- [ ] 锁定按钮立即清空内存中的解锁状态
