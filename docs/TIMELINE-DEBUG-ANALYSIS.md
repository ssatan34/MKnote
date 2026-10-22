# 时间轴弹窗「高亮条 / 当前笔记对不齐」问题分析

> 日期：2026-07-04
> 状态：**未解决**，本文用于停止盲目试错、回到数据驱动排查
> 相关文件：`src/components/TimelineView.tsx`、`src/components/TimelineView.css`

---

## 一、现象（客观描述）

时间轴弹窗打开后：

- 中间有一条固定的高亮条（`.timeline-active-bar`）。
- 期望：当前选中的笔记行正好压在高亮条上；滚轮 / 上下键切换时，被选中的笔记始终居中且被高亮条罩住。
- 实际：**高亮条落在两条笔记之间的空隙里**，没有任何一行压在上面。上下键逐行移动时，选中位置始终"卡在两行中间"。

截图关键信息（务必据此复现）：

- 底部计数显示 `2 / 3` → `notes.length === 3`，`activeIdx === 1`。
- 可见的**文字行**只有两条：`会议记录_20260620003146`（01:00）、`今日工作_20260620003254`（00:32）。
- 二者之间隔着约一整行高度，高亮条就在这段空隙里，**空隙里没有文字**。
- 分隔行 `6月20日` 在 `会议记录` 上方。
- 当前打开的笔记是 `沟通记录_20260620003306`（第三条，未在可见区出现文字）。

> ⚠️ 重点疑点：`3` 条笔记 + `1` 个日期分隔 = flat 列表理应是
> `[sep, note0, note1, note2]` 连续排列，相邻 note 之间**不该有空行**。
> 但截图里 `会议记录` 与 `今日工作` 之间明显有一整行的空隙。
> **这说明"可见槽位数 / 排布"与我们的数据模型不一致——这是目前最没被验证、也最可疑的地方。**

---

## 二、已经踩过的坑（按时间顺序）

| 轮次 | 当时的假设 | 采取的做法 | 结果 | 复盘 |
|------|-----------|-----------|------|------|
| 1 | 直接照搬 Figma 参考代码，`CENTER = VIEWPORT_H/2` 用常量 | 固定 `VIEWPORT_H = NOTE_H * n`，`translateY = CENTER - noteCenter` | 不齐 | Figma 版弹窗高度是写死的；我们的弹窗被 `max-height` 裁剪，常量 `VIEWPORT_H` ≠ 实际高度 |
| 2 | 实际高度被 `max-height` 裁了 | 加 `ResizeObserver` 测 `contentRect.height` 存入 `viewH` | 不齐 | viewport 上写了 inline `height`，flex 没生效，`contentRect` 仍是写死值 |
| 3 | 高亮条 `top` 用 JS 常量算偏了 | 高亮条改纯 CSS `top:50%; translateY(-50%)`；`translateY` 用 `el.clientHeight` | 不齐 | `top:50%` 相对 viewport，`translateY` 用另一处高度，两个参照未必一致 |
| 4 | 高亮条和列表用了不同高度来源 | 高亮条 `top` 和 `translateY` 都用同一次 `getBoundingClientRect().height` | 不齐 | 数学上两者都指向 `vpH/2`，理应重合，但仍不齐 → 说明问题不在这条链路 |
| 5 | 逻辑坐标（`NOTE_H`/`SEP_H` 常量推算）≠ 实际布局 | 改成 `querySelector('[data-note-index]')` 读 `offsetTop`/`offsetHeight` 实测 | **仍不齐** | 数学同样可证明对齐，却依然错位 → 强烈暗示**真正的根因根本不在"对齐算式"里** |

### 共性教训

1. **一直在"对齐算式"里打转**，反复换测量来源，但每一版都能在纸面证明 `bar center == row center == vpH/2`。既然数学都成立却仍错位，说明**问题不在这条算式链路**，继续在这里改必然徒劳。
2. **从头到尾没有拿过一次真实运行数据**（`vpH`、`offsetTop`、`translateY`、`activeBarTop`、`notes.length`、`activeIdx`、`el` 是否命中）。全靠读代码 + 看截图推理，这是反复失败的根本原因。
3. **没验证改动是否真的生效**（HMR 是否热更成功、有没有加载到旧构建）。

---

## 三、当前实现的关键结构（便于对照）

```
.timeline-viewport   position: relative; overflow: hidden; flex:1 1 0   ← 参照系
├─ .timeline-fade-top / bottom   absolute，纯视觉遮罩
├─ .timeline-active-bar          absolute; top = activeBarTop(JS)       ← 高亮条
├─ .timeline-track               absolute，竖线
└─ .timeline-list                absolute; top:0; transform:translateY(JS)  ← 会移动的列表
   └─ .timeline-note[data-note-index]  position:relative; height:32; flex-shrink:0
```

对齐算式（第 5 轮）：

```
vpH        = viewport.clientHeight
el         = viewport.querySelector('.timeline-note[data-note-index=activeIdx]')
rowTop     = el.offsetTop        // 相对 offsetParent(.timeline-list)
rowH       = el.offsetHeight
translateY = vpH/2 - (rowTop + rowH/2)
activeBarTop = vpH/2 - rowH/2

→ 行在视口内的中心 = rowTop + translateY + rowH/2 = vpH/2
→ 高亮条中心       = activeBarTop + rowH/2        = vpH/2   （二者相等）
```

**纸面成立。所以 bug 不在这里。**

---

## 四、仍未排除的假设（按可疑度排序）

### 🔴 H1：状态多源 + 异步 rAF 导致「渲染的 activeIdx」与「几何 translateY/barTop」永久错配

这是目前**最可疑**的。当前有四个独立 state：`activeIdx`、`translateY`、`activeBarTop`、`barH`。

- 笔记行的高亮（`opacity=1`、加粗、颜色）是渲染时**直接**用 `activeIdx` 算的。
- 而 `translateY` / `activeBarTop` 是在 `useEffect` 里经过 **双 `requestAnimationFrame`** 异步 `setState` 的。

潜在问题：
1. 二者不在同一次渲染提交，滚动过程中天然有 1~2 帧的相位差。
2. 如果某次 `sync` 读到的 `el` 是**上一个** activeIdx 对应的元素（DOM 还没提交新状态就跑了 rAF），几何会锁在错误位置。
3. `sync` 用 `useCallback(deps=[notes])`，闭包里捕获的 `flat`/DOM 状态可能与当前渲染不同步。

> **验证方式**：在 `sync` 内 `console.log(idx, vpH, rowTop, rowH, translateY, el?.textContent)`，滚动几次看数值是否与屏幕一致、是否滞后一帧。

### 🔴 H2：数据里存在「不可见行 / 幽灵行」，导致排布与索引错位

截图里 `会议记录` 与 `今日工作` 之间有**一整行空隙**，这不符合 flat 连续排列。可能：

1. 某条笔记 `title` 为空串或全空白 → 渲染成一条**空白行**，正好被高亮条罩住，看起来"高亮条落在空隙"。
2. `list_notes` 返回了某条 `title === ""` 或异常的笔记（例如刚新建、未命名但不匹配 17 位时间戳正则的边界文件）。
3. 分隔行 `.timeline-sep`（26px）与 note 行（32px）高度不同，若某处把 sep 也当 note 计数或渲染，会插入错位。

> **验证方式**：`console.log(notes.map(n => [n.name, JSON.stringify(n.title), n.modified_ms]))`，
> 确认是否有空 title、是否真有 3 条、排序是否符合预期。

### 🟠 H3：`offsetParent` 不是 `.timeline-list`，`offsetTop` 参照系错误

第 5 轮假设 `el.offsetTop` 相对 `.timeline-list`。但若中间还有其它 `position` 元素，或某浏览器/WebView（Tauri 用系统 WebView）对 `offsetParent` 处理不同，`offsetTop` 可能相对 viewport 甚至 body。

> **验证方式**：`console.log(el.offsetParent?.className)`，确认是不是 `timeline-list`。

### 🟠 H4：rAF 时机读到动画中的尺寸；且之后无人再校正

弹窗开场有 `timeline-in` 缩放动画（0.18s）。双 rAF ≈ 32ms，动画还在放大。`getBoundingClientRect().height` 读到缩放中的高度。虽然第 5 轮加了 `ResizeObserver`，但要确认它**确实**在动画结束后又触发了一次 `sync`，且不是被 `[activeIdx, sync]` 依赖频繁重建导致时序混乱。

> **验证方式**：在 ResizeObserver 回调里 log 触发次数与当时的 `vpH`。

### 🟡 H5：改动没真正生效（HMR / 缓存 / 构建）

反复"没有任何改善"这一现象本身可疑。有没有可能页面加载的是旧的构建产物？

> **验证方式**：在文件里放一句显眼的 `console.log("TIMELINE v6")`，确认控制台能打印当前版本。

### 🟡 H6：`transform: scale()` 或 `transition` 的副作用

行上有 `transform: scale()`，列表有 `transition: transform 0.22s`。理论上 `offsetTop/offsetHeight` 不受 transform 影响，但需排除 WebView 差异，以及 `transition` 动画中途读值。

---

## 五、下一步该怎么做（数据驱动，不要再盲改）

### 第 1 步：加埋点，拿真实数据（必须先做）

在 `sync()` 和数据加载处打印：

```ts
console.log("[TL] notes", notes.map(n => [n.name, JSON.stringify(n.title)]));
console.log("[TL] sync", { idx, vpH, rowTop, rowH, translateY, barTop,
  elText: el?.textContent, offsetParent: el?.offsetParent?.className });
```

用这些数据回答三个问题：
1. `notes` 里是不是真有 3 条？有没有空 title？排序对不对？（验 H2）
2. `sync` 打印的 `idx` 和屏幕上高亮的行是否一致、是否滞后？（验 H1）
3. `el.offsetParent` 是不是 `timeline-list`？`rowTop` 数值合不合理？（验 H3）

### 第 2 步：根据数据选定方向，而不是继续换算式

- 若 H2 成立（有空白行/幽灵行）→ 修数据过滤 & 渲染，而不是改对齐。
- 若 H1 成立（状态相位差）→ 见下方"架构级重构建议"。

### 第 3 步（推荐）：换成更稳的架构，绕开所有手算

当前"绝对定位 + `translateY` 手动居中 + 独立高亮条 state"链路太脆，四个 state 容易失步。建议改为**浏览器原生滚动居中**：

方案 A — 原生 `scrollIntoView`：
```
.timeline-viewport { overflow-y: auto; }          /* 真滚动容器 */
.timeline-list      { position: static; }          /* 正常文档流 */
/* 首尾各加 padding = vpH/2 - rowH/2，让第一条/最后一条也能滚到正中 */
高亮条：CSS 固定 top:50%; translateY(-50%)         /* 永远在正中，纯 CSS */
切换时：activeEl.scrollIntoView({ block: "center", behavior: "smooth" })
```
优点：居中交给浏览器（`block:"center"` 身经百战），高亮条纯 CSS 永远居中，**彻底没有手算、没有多 state 失步**。只需保证滚动容器高度稳定。

方案 B — 若坚持 `translateY`：把 `translateY` 改为**渲染期同步派生**（用 `useLayoutEffect` 而非 rAF+setState），保证与 `activeIdx` 同一帧提交，消除相位差。

### 第 4 步：验证生效

放版本号 log，确认加载的是新代码；确认 `npm run tauri dev` 的 HMR 真的更新了。

---

## 六、给下一个接手者的一句话总结

> **别再改"对齐算式"了——已经用两种测量方式各证明过一次它数学上成立。**
> 先加 `console.log` 把 `notes`、`activeIdx`、`el.offsetTop`、`vpH`、`el.offsetParent` 打出来，
> 重点验证 **H2（幽灵/空白行）** 和 **H1（状态相位差）**。
> 拿到真实数据前，任何进一步的代码修改都是继续盲猜。
> 若要一步到位，直接换成 **原生 `scrollIntoView({block:"center"})` + CSS 固定居中高亮条** 的架构。
