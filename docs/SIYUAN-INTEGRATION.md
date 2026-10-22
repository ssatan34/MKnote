# 思源笔记上传（M10）

## 产品规则

- **范围**：仅上传当前打开的便签。
- **冲突**：以 MKnote 为准，覆盖思源正文（`updateBlock`）。
- **路径**：固定前缀 `/MKnote/{标题}`（不区分 MKnote 内所在文件夹）。
- **待办**：`File/default/待办事项.md` 禁止上传。

## 配置

保存在应用根目录 `config.json`：

- `siyuan_api_url`：默认 `http://127.0.0.1:6806`
- `siyuan_api_token`：思源「设置 → 关于 → API token」
- `siyuan_notebook_id`：目标笔记本 ID

映射表：`File/.mknote-siyuan-map.json`（`zone + 文件名` → 思源 `doc_id`）。

## 使用

1. 启动思源笔记并保持内核 API 可用。
2. 底部状态栏 **思源** 按钮 → 设置面板：填写地址与 Token，**测试连接**，选择笔记本。
3. 底部状态栏 **同步** 按钮：上传当前便签。

## API

| Tauri 命令 | 说明 |
|------------|------|
| `siyuan_test_connection` | 列出笔记本 |
| `siyuan_list_notebooks` | 同上 |
| `set_siyuan_config` | 保存配置 |
| `siyuan_upload_current_note` | 上传/覆盖当前篇 |

实现：`src-tauri/src/siyuan.rs`、`siyuan_map.rs`。

## 参考

- [思源内核 API](https://docs.siyuan-note.club/zh-Hans/reference/api/kernel/)
- [SmartClip](https://www.smartclip.app/help)（剪藏产品参考，MKnote 为本地 md → 思源推送）
