# Markdown 渲染全量测试

用于验证 **编辑 / 预览**、代码高亮、GFM 扩展与可视化编辑。

---

## 1. 标题

### 三级标题

#### 四级标题

---

## 2. 强调与链接

普通文字，**加粗**，*斜体*，~~删除线~~，行内 `code`，以及 [MKnote 链接](https://example.com)。

<u>下划线 HTML</u> 与 <mark>荧光笔高亮</mark>（若支持 HTML）。

---

## 3. 列表

### 无序

- 苹果
- 香蕉
  - 子项 A
  - 子项 B

### 有序

1. 第一步
2. 第二步
3. 第三步

### 任务（应只有复选框、无圆点）

- [x] 已完成：检查无多余列表圆点
- [ ] 待办：点击复选框可切换
- [ ] 另一项待办

---

## 4. 代码高亮

```javascript
function fib(n) {
  if (n <= 1) return n;
  return fib(n - 1) + fib(n - 2);
}
console.log(fib(10));
```

```python
def greet(name: str) -> str:
    return f"Hello, {name}!"

print(greet("MKnote"))
```

```rust
fn main() {
    println!("Hello, MKnote!");
}
```

```json
{ "theme": "light", "always_on_top": true }
```

---

## 5. 引用与分隔线

> 这是一段引用。
> 可以有多行。

---

## 6. 表格

| 功能 | 状态 | 备注 |
|------|:----:|------|
| 编辑 | ✅ | 源码模式 |
| 预览 | ✅ | 可视化 |
| 保存 | ✅ | 防抖 |

---

## 7. 图片占位

![占位图](https://via.placeholder.com/120x48?text=MKnote)

---

## 8. 混合段落

最后一行：`Ctrl+Shift+V` 切换模式；任务行用左侧 **☑** 工具插入 `- [ ]`。
