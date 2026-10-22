---
name: mknote-green-package
description: 为 MKnote/MDnote 生成 Windows 绿色便携版 ZIP。只要用户要求打包绿色版、便携版、绿色 ZIP，或需要一个可供进一步测试的 MKnote 测试包，就使用本 Skill；它会复用仓库的 build:green 流程，检查构建产物是否是当前代码，并验证 ZIP 只包含可运行 EXE 与说明文件。
compatibility: Windows PowerShell, Node.js/npm, Rust toolchain, Tauri CLI, WebView2 runtime
---

# MKnote 绿色版打包

为用户生成可以直接解压测试的 Windows 绿色便携版。绿色包应当与源码目录和开发环境解耦，因此只交付 `MarkdownStickyNote.exe` 与 `README.txt`，不把 `node_modules`、`dist`、Rust target、用户数据或开发机配置带进 ZIP。

## 工作目录与前置检查

1. 将当前工作目录确认在 MKnote/MDnote 仓库根目录，并读取 `package.json` 的版本号。
2. 读取 `scripts/build-green.ps1` 与 `scripts/pack-green.ps1`，确认仓库的实际打包入口；优先调用现有脚本，不要复制或手写另一套发布流程。
3. 检查 `git status --short`。保留用户已有修改，不执行 reset、checkout、clean 或删除无关产物。
4. 若仓库有 `AGENTS.md`，遵循其中的项目规则；若项目文档指定了不同的绿色包入口，以项目文档和脚本为准。

## 构建

在仓库根目录执行：

```powershell
npm.cmd run build:green
```

这个命令会先完成前端构建和 Tauri release 构建，再调用绿色包脚本生成时间戳 ZIP。构建可能超过常用工具的短等待时间；命令因等待上限中断时，不要立即判定失败，先检查以下产物的时间和大小：

- `src-tauri/target/release/md-sticky-note.exe`
- `dist/index.html`
- `portable/MarkdownStickyNote.exe`
- 根目录最新的 `MKnote-portable-v<version>-*.zip`

只有在 release EXE 存在且不早于本次 `dist/index.html`，并且打包脚本已生成新的 ZIP 时，才可将其视为成功。若产物不完整，继续以足够长的等待时间运行同一命令；不要直接压缩旧 EXE。

## 发布包校验

找到本次生成的最新 ZIP 后，必须检查：

1. 文件名版本与 `package.json` 一致，时间戳对应本次构建。
2. ZIP 内的文件名严格为：

   ```text
   MarkdownStickyNote.exe
   README.txt
   ```

3. 不存在目录穿越路径、用户数据、`config.json`、便签目录、安装包或开发文件。
4. `portable/MarkdownStickyNote.exe` 与 release EXE 都存在，并且大小合理、时间不早于当前前端构建。
5. 计算并报告 ZIP 的 SHA-256，便于用户确认传输过程中未被替换。

PowerShell 校验示例：

```powershell
$zip = Get-ChildItem -LiteralPath . -Filter 'MKnote-portable-v*.zip' |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
[System.IO.Compression.ZipFile]::OpenRead($zip.FullName).Entries |
  Select-Object -ExpandProperty FullName
Get-FileHash -LiteralPath $zip.FullName -Algorithm SHA256
```

## 交付报告

用简体中文简洁报告：

- ZIP 的绝对路径（使用可点击 Markdown 文件链接）
- 是否构建成功
- ZIP 内文件清单
- SHA-256（可截短显示，但要说明是截短值）
- 若有 Rust/前端 warning，说明它们是 warning 还是导致构建失败
- 明确提示用户：绿色包运行时若已有开发版/旧版 MKnote 进程，应先退出旧实例，否则单实例机制可能让测试请求被旧进程接管

不要把“命令超时”直接写成“构建失败”；必须结合实际产物和 ZIP 校验结果判断。

## 边界

- 用户只要求打包时，不修改业务代码、不修复测试失败、不提交 Git、不生成安装包。
- 不删除旧 ZIP、截图、`.codex-smoke` 或其他用户产物；新包使用脚本生成的时间戳名称。
- 不把旧 ZIP 当作当前代码的结果，除非已经证明其生成时间晚于当前 release EXE 和前端构建。
