# 分发许可证生成

在仓库根目录运行，保持 `package-lock.json` 与 `Cargo.lock` 不变。仅需在依赖变化时重新生成；不要公开原始工具 JSON，其中可能包含本机路径。

1. `npm ci` 安装锁定依赖。
2. 从 [cargo-about 官方 Releases](https://github.com/EmbarkStudios/cargo-about/releases/tag/0.9.2) 安装 0.9.2，核对发布的 SHA-256；将 `cargo-about` 放入 PATH。
3. 将工具原始报告输出到仓库外的临时目录：

```powershell
npx --yes license-checker-rseidelsohn@3.0.1 --json --customPath scripts/licenses/npm-format.json --out "$env:TEMP/mknote-npm-licenses.json"
cargo-about generate --manifest-path src-tauri/Cargo.toml --locked --config scripts/licenses/about.toml --format json --output-file "$env:TEMP/mknote-cargo-licenses.json"
node scripts/licenses/collect.mjs "$env:TEMP/mknote-npm-licenses.json" "$env:TEMP/mknote-cargo-licenses.json"
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/licenses/pack-mpl-sources.ps1
$rustSysroot = rustc --print sysroot
Copy-Item "$rustSysroot/share/doc/rust/COPYRIGHT-library.html" LICENSES/Rust-Standard-Library.html
rustc --version | Set-Content LICENSES/rust-toolchain.txt -Encoding UTF8
```

`collect.mjs` 只负责组合上游工具已收集的许可文本、补充依赖包中的 NOTICE/COPYRIGHT/LICENSE 原文并移除本机路径。它会核对 npm 锁定版本及 Windows Rust 清单覆盖率。范围有意包含部分构建工具，不声称所有条目都进入 EXE。Cargo 多重许可优先选择 MIT；组合许可仍须全部满足。

MPL 2.0 的 Windows 依赖以未修改的原始 `.crate` 源码归档提供，文件名、下载地址和 SHA-256 见 `LICENSES/mpl-sources.json`；随包 `MPL-2.0-sources.zip` 包含这些归档。更新依赖后须按清单更新源码包，并核对 `dependency-inventory.json`。DOMPurify 选择 Apache-2.0；lightningcss 为构建期 CSS 工具，其原生库不随 EXE 分发。

提交前检查生成的文本不包含本机路径、凭据或用户配置。`npm run build:green` 使用全新的分发暂存目录，缺少许可证或 MPL 源码归档时会停止；仅上传已校验的新 ZIP，不上传 `portable/` 中的运行数据。

## 公开 EXE 的编译路径

打包脚本会检查 EXE 是否含开发用户目录或当前源码绝对路径。Rust 路径由构建脚本映射，PDB 记录仅保留文件名；MSVC 编译的 AWS-LC 原生 C 代码仍可能通过 `__FILE__` 保留 Cargo 缓存路径。因此公开发行构建需使用不含个人信息的独立 `CARGO_HOME`（例如 `C:\MKnoteBuildCache`），先在其中执行 `cargo fetch --locked --manifest-path src-tauri/Cargo.toml`，再运行 `npm run build:green`。AWS-LC 源码目录须为该路径下的实际目录，不能用指向个人目录的链接替代，原生编译器可能将链接还原为真实路径。这只改变构建缓存位置，不修改第三方源码或应用数据路径。

不要把含注册表令牌或私有源认证的 Cargo 配置复制到分发包。首次切换缓存路径会重新编译依赖。原有缓存可以保留；构建日志、临时工具报告和个人配置均不入库、不上传。
