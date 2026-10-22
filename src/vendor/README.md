# 内置 Lute 来源与版本

核验日期：2026-10-22。当前 `lute.min.cjs` 的程序代码未替换。

- 上游：[88250/lute](https://github.com/88250/lute)。Copyright (c) 2019-present, b3log.org。
- 精确来源：[ead82ece3dcf31cf1399fc41fd44b721c10059de / javascript/lute.min.js](https://github.com/88250/lute/blob/ead82ece3dcf31cf1399fc41fd44b721c10059de/javascript/lute.min.js)，提交时间为 2026-07-02。
- 实际运行时 `globalThis.Lute.Version`：`1.7.6`；文件头 Go 版本：`go1.20.14`。
- 授权：[MulanPSL-2.0](../../LICENSES/Lute-MulanPSL-2.0.txt)，来自同一上游提交的根目录 LICENSE。
- 完整机器可读来源记录：[lute.provenance.json](lute.provenance.json)。

## 精确文件验证

原工作副本使用 CRLF 换行，Git 保存为 LF。先前比较未消除这项差异，导致没有找到文件对象。将 CRLF 转为 LF 后，与上游文件逐字节一致，没有其他差异：

| 形式 | 字节数 | SHA-256 |
| --- | --- | --- |
| 上游 / Git 中的 LF 文件 | 3,673,633 | `6e82eb043fc07e3b3d9d7eb5935740bf5ec684ddea0c8c054d449733552a61d9` |
| 原 Windows CRLF 工作副本 | 3,673,712 | `bbf54a7d1bfcb2737d38b716d13d901344b6a9815b38c4610d4015d035a38629` |

LF 文件的 Git blob 为 `8e2d73c988a51d9291731b53279dfef0498f80bc`。本地 `.cjs` 只是后缀不同；文件正文没有添加 CommonJS 包装。

旧注释曾指向“随 SiYuan 3.8.0 提供”，但不能用该发行标签证明本文件来源；现在以已匹配的 Lute 提交作为依据。历史上最初从哪个安装目录复制的操作记录，不影响这次已取得的上游内容匹配证据。

## 内嵌代码与构建信息

该文件包含 Go 标准库、GopherJS 运行时，以及 `golang.org/x/text` 的 `transform` / `width` 包。许可副本与来源见 [第三方声明](../../THIRD_PARTY_NOTICES.md)。

同一提交的 [go.mod](https://github.com/88250/lute/blob/ead82ece3dcf31cf1399fc41fd44b721c10059de/go.mod) 声明 GopherJS `v1.17.2`、x/text `v0.21.0`。这是源树依赖声明，不能单独证明打包者实际安装的 GopherJS 编译器版本。本文确认的是精确发布构建文件的来源；没有声称已复现整个编译过程。未在此 JavaScript 中发现的 Go 依赖不列为其内嵌组件。
