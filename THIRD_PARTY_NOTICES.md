# 第三方代码与素材声明

MKnote 原创代码采用根目录 [MIT License](LICENSE)。第三方代码、依赖、商标和素材仍受各自授权约束，不因主项目选择 MIT 而重新授权。核验日期：2026-10-22。

## 内置 Lute 与运行时

`src/vendor/lute.min.cjs` 与 [Lute 提交 ead82ece3dcf31cf1399fc41fd44b721c10059de 的构建文件](https://github.com/88250/lute/blob/ead82ece3dcf31cf1399fc41fd44b721c10059de/javascript/lute.min.js) 在仅统一 CRLF / LF 换行后逐字节一致，实际运行版本为 1.7.6。Copyright (c) 2019-present, b3log.org。

| 组件 | 来源 / 版本证据 | 许可证副本 |
| --- | --- | --- |
| Lute | 上述精确提交的构建文件、根目录 LICENSE 与 lute.go 声明 | [MulanPSL-2.0](LICENSES/Lute-MulanPSL-2.0.txt) |
| Go 标准库 / 运行时 | 构建文件头标识 `go1.20.14`；Copyright (c) 2009 The Go Authors | [BSD-3-Clause](LICENSES/Go-BSD-3-Clause.txt) |
| GopherJS 运行时 | 构建文件包含相应包；同一提交 go.mod 声明 v1.17.2；Copyright (c) 2013 Richard Musiol | [BSD-2-Clause](LICENSES/GopherJS-BSD-2-Clause.txt) |
| golang.org/x/text | 构建文件包含 transform / width；同一提交 go.mod 声明 v0.21.0；Copyright (c) 2009 The Go Authors | [BSD-3-Clause](LICENSES/golang-x-text-BSD-3-Clause.txt) |

完整来源、规范化哈希与构建工具证据边界见 [Lute 来源记录](src/vendor/README.md) 和 [机器可读记录](src/vendor/lute.provenance.json)。go.mod 是依赖声明，不能单独证明打包者安装的 GopherJS 编译器版本；精确上游发布文件已匹配，无需替换当前程序代码。

许可证文本来源：[Lute 同一提交 LICENSE](https://github.com/88250/lute/blob/ead82ece3dcf31cf1399fc41fd44b721c10059de/LICENSE)、[Go go1.20.14](https://github.com/golang/go/blob/go1.20.14/LICENSE)、[GopherJS v1.17.2](https://github.com/gopherjs/gopherjs/blob/v1.17.2/LICENSE)、[x/text v0.21.0](https://github.com/golang/text/blob/v0.21.0/LICENSE)。保留完整版权、许可条件与免责声明。

## SVG、图标与品牌素材

当前源码树的全部 **132 个 SVG** 已逐个登记在 [SVG 来源清单](LICENSES/svg-provenance.json)，包含文件哈希、许可、来源和修改说明。安装依赖与构建输出中的 SVG 不计入这 132 个。

| 来源 | 当前使用范围 | 许可证与版权声明 |
| --- | --- | --- |
| IconPark | 97 个 UI 图标的上游部分，以及 2 份置顶动画预览中的打开图钉 | [Apache-2.0 全文](LICENSES/IconPark-Apache-2.0.txt)；ByteDance IconPark 及贡献者 |
| Remix Icon v4.6.0 | align-left / center / right 三个 SVG | [Apache-2.0 全文](LICENSES/RemixIcon-Apache-2.0.txt)；Remix Design 及贡献者；按 v4.6.0 的授权使用这些文件 |
| Heroicons v2.2.0 | ai / ai-assist 星光图标 | [MIT 全文](LICENSES/Heroicons-MIT.txt)；Copyright (c) Tailwind Labs, Inc. |
| Feather v4.29.2 | run-script 闪电图标 | [MIT 全文](LICENSES/Feather-MIT.txt)；Copyright (c) 2013-2023 Cole Bemis |
| Lucide React v1.20.0 | 25 个 UI SVG，以及 2 份预览中的关闭图钉 | [完整 ISC / MIT 声明](LICENSES/Lucide-ISC.txt)；Copyright (c) 2026 Lucide Icons and Contributors，并保留文件内的 Feather 原始声明 |
| MKnote 品牌 | 内嵌羽毛 PNG 的 logo.svg、单色 SVG、透明母版及系统图标导出文件 | 项目所有者于 2026-10-22 确认其为原创或 AI 生成、允许随项目公开，按主项目 MIT 授权分发 |

固定来源：[IconPark bed2e8d1…](https://github.com/bytedance/IconPark/tree/bed2e8d1e451ffc66cbc4def3ba54fcc1f318d9e/source)、[Remix Icon v4.6.0 对应提交](https://github.com/Remix-Design/RemixIcon/tree/8bc436bdd329cf342958d8effdd078bfa74354c6)、[Heroicons v2.2.0](https://github.com/tailwindlabs/heroicons/tree/v2.2.0/optimized)、[Feather v4.29.2](https://github.com/feathericons/feather/tree/v4.29.2/icons)、[Lucide React 精确版本发布包](https://registry.npmjs.org/lucide-react/-/lucide-react-1.20.0.tgz)。采用历史版本许可证时，以这些固定内容为依据，不套用其他版本的许可。

本项目对部分图标进行了缩放、改色、路径删改或组合；清单明确记录这些改动，不将衍生图标声明为完全原创。26 个无法充分核实历史来源的 UI 图标已换为有明确许可的同义图标，保留全部名称和功能调用。未使用的 React / Vite / Tauri 脚手架 Logo SVG 已从当前源码树移除，favicon 使用 MKnote 自有品牌。第三方项目名称及商标仍属于相应权利人。

## 参考 UI 与素材

项目所有者于 2026-10-22 确认两套参考界面（Dark Futuristic Toolbar UI / Timeline Note List UI）均由其本人设计，允许随项目源码分发；其原创部分适用主项目 MIT 许可证。原始 Figma 设计文件保持私有，源码仓库不提供其地址。第三方组件与素材仍按以下声明保留各自授权。

`Refs/capsule-ui-ref`、`Refs/timeline-ui` 的 shadcn/ui 参考组件适用 MIT；[完整许可](LICENSES/shadcn-ui-MIT.txt)保留 Copyright (c) 2023 shadcn，许可文本来源固定为 [ba1503c64472b82256d9de95e2e62c5901a38e8b](https://github.com/shadcn-ui/ui/blob/ba1503c64472b82256d9de95e2e62c5901a38e8b/LICENSE.md)。该提交用于固定许可文本，不表示参考 UI 的组件版本已确定。

保留两份原始素材声明：[capsule-ui-ref](Refs/capsule-ui-ref/ATTRIBUTIONS.md)、[timeline-ui](Refs/timeline-ui/ATTRIBUTIONS.md)。其中的 Unsplash 素材适用 [Unsplash License](https://unsplash.com/license)，不适用本项目 MIT；引用该声明不表示当前应用运行时包含相应照片。

## 包管理器依赖与后续二进制分发

完整版本与许可元数据见 [依赖清单](LICENSES/dependency-inventory.json)。npm 精确版本来自 package-lock.json，许可信息取对应版本的安装包元数据、锁文件或官方注册表；Rust 版本与许可来自 Cargo.lock 对应的元数据。清单包括 355 个 npm 条目及 Windows 目标图中的 432 个 Rust 依赖，不包含本机缓存路径或私有配置，也不代表全部条目都进入最终可执行文件。

主要依赖包括 React、Milkdown / ProseMirror、Radix UI、Tauri、AWS SDK for Rust、reqwest、DOMPurify、lightningcss、highlight.js 等。以清单中精确版本的许可为准，不能假设所有依赖均为 MIT。

部分依赖采用 MPL-2.0 或提供包含 MPL-2.0 的双重许可选项，例如 lightningcss、部分 Rust 解析器依赖与 DOMPurify。后续分发二进制时，应根据实际选用许可收集完整版权声明，并履行相关源码获取等义务；参见 [Mozilla 官方 MPL FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/)。

本次准备的是源码仓库，没有发布安装包或绿色包。现有打包脚本不会自动收集这里的全部声明；发布二进制前须将本项目 LICENSE、本文件及实际包含组件的完整版权和许可文件随包提供。依赖清单不能替代分发所需的许可原文。
