import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const markdownOutput = (page: Page) =>
  page.locator("#markdown-output");

test("PoC 挂载结构化编辑器并保持临时序列化与 Undo/Redo 一致", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.locator("#editor-status")).toHaveAttribute(
    "data-state",
    "ready",
  );
  await expect(page.locator(".ProseMirror")).toBeVisible();
  await expect(page.locator("#markdown-output")).toContainText(
    "[ ] 待完成的事情",
  );

  const editor = page.locator(".ProseMirror");
  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("中文输入事务");
  await expect(page.locator("#markdown-output")).toContainText("中文输入事务");

  await page.keyboard.press("Control+Z");
  await expect(page.locator("#markdown-output")).not.toContainText("中文输入事务");

  await page.keyboard.press("Control+Y");
  await expect(page.locator("#markdown-output")).toContainText("中文输入事务");
});

test("列表 Enter 创建同级项，Tab 与 Shift+Tab 调整层级", async ({ page }) => {
  await page.goto("/");

  const sourceItem = page
    .locator(".ProseMirror p")
    .filter({ hasText: "先写事实" })
    .first();
  await sourceItem.click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("新增同级行动项");

  const newItem = page
    .locator(".ProseMirror li > p")
    .filter({ hasText: "新增同级行动项" })
    .first()
    .locator("..");
  await expect(newItem).toBeVisible();

  const listDepth = async (): Promise<number> =>
    newItem.evaluate((element) => {
      let depth = 0;
      let list = element.closest("ul, ol");
      while (list) {
        depth += 1;
        list = list.parentElement?.closest("ul, ol") ?? null;
      }
      return depth;
    });

  await expect.poll(listDepth).toBe(1);

  await page.keyboard.press("Tab");
  await expect.poll(listDepth).toBe(2);

  await page.keyboard.press("Shift+Tab");
  await expect.poll(listDepth).toBe(1);
});

test("嵌套列表项在行首 Backspace 会回到上一级列表", async ({ page }) => {
  await page.goto("/");

  const nestedItem = page
    .locator(".ProseMirror p")
    .filter({ hasText: "再补充行动项" })
    .first();
  await nestedItem.click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Backspace");

  const item = page
    .locator(".ProseMirror li > p")
    .filter({ hasText: "再补充行动项" })
    .first()
    .locator("..");
  await expect(item).toBeVisible();
  await expect
    .poll(() =>
      item.evaluate((element) => {
        let depth = 0;
        let list = element.closest("ul, ol");
        while (list) {
          depth += 1;
          list = list.parentElement?.closest("ul, ol") ?? null;
        }
        return depth;
      }),
    )
    .toBe(1);
});

test("任务项点击通过事务更新 DOM 和临时 Markdown，并可撤销重做", async ({
  page,
}) => {
  await page.goto("/");

  const task = page
    .locator('li[data-item-type="task"]')
    .filter({ hasText: "待完成的事情" })
    .first();
  await expect(task).toHaveAttribute("data-checked", "false");

  const box = await task.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + 6, box!.y + box!.height / 2);

  await expect(task).toHaveAttribute("data-checked", "true");
  await expect
    .poll(async () => (await markdownOutput(page).textContent()) ?? "")
    .toMatch(/\[[xX]\]\s+待完成的事情/);

  await page.keyboard.press("Control+Z");
  await expect(task).toHaveAttribute("data-checked", "false");
  await expect
    .poll(async () => (await markdownOutput(page).textContent()) ?? "")
    .toMatch(/\[\s\]\s+待完成的事情/);

  await page.keyboard.press("Control+Y");
  await expect(task).toHaveAttribute("data-checked", "true");
  await expect
    .poll(async () => (await markdownOutput(page).textContent()) ?? "")
    .toMatch(/\[[xX]\]\s+待完成的事情/);
});

test("DOM 选区替换会同步编辑器和临时 Markdown", async ({ page }) => {
  await page.goto("/");

  const paragraph = page
    .locator(".ProseMirror p")
    .filter({ hasText: "这是一份不连接生产保存的临时文档" })
    .first();
  // Home/End select only a visual line when the paragraph wraps. Select the
  // DOM text so this contract remains stable across window sizes and fonts.
  await paragraph.selectText();
  await page.keyboard.insertText("替换后的中文段落");

  await expect(
    page
      .locator(".ProseMirror p")
      .filter({ hasText: "替换后的中文段落" })
      .first(),
  ).toContainText("替换后的中文段落");
  await expect(markdownOutput(page)).toContainText("替换后的中文段落");
  await expect(markdownOutput(page)).not.toContainText(
    "这是一份不连接生产保存的临时文档",
  );
});

test("键盘复制粘贴会保留文本并更新临时 Markdown", async ({ page }) => {
  await page.goto("/");

  const source = page
    .locator(".ProseMirror p")
    .filter({ hasText: "先写事实" })
    .first();
  await source.selectText();
  await page.keyboard.press("Control+C");

  const target = page
    .locator(".ProseMirror p")
    .filter({ hasText: "这是一份不连接生产保存的临时文档" })
    .first();
  await expect(target).toBeVisible();
  await page.locator(".ProseMirror").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Control+V");

  await expect
    .poll(async () => (await markdownOutput(page).textContent()) ?? "")
    .toMatch(/先写事实[\s\S]*先写事实/);
});

test("GFM 表格支持 Tab 跨格，并在末格继续创建新行", async ({ page }) => {
  await page.goto("/");

  const table = page.locator(".ProseMirror table");
  const bodyRows = table.locator("tr:has(td)");
  await expect(table).toBeVisible();
  await expect(bodyRows).toHaveCount(2);

  const firstBodyRow = bodyRows.first();
  await firstBodyRow.locator("td").first().click();
  await page.keyboard.press("End");
  await page.keyboard.press("Tab");
  await page.keyboard.insertText("已确认");
  await expect(firstBodyRow.locator("td").nth(1)).toContainText("已确认");

  const lastBodyCell = bodyRows.last().locator("td").last();
  await lastBodyCell.click();
  await page.keyboard.press("End");
  await page.keyboard.press("Tab");
  await page.keyboard.insertText("新增行动项");

  await expect(bodyRows).toHaveCount(3);
  await expect(bodyRows.last().locator("td").first()).toContainText(
    "新增行动项",
  );
  await expect(markdownOutput(page)).toContainText("新增行动项");
});

test("表格上下文工具支持插入和删除当前行列", async ({ page }) => {
  await page.goto("/");

  const table = page.locator(".ProseMirror table");
  const bodyRows = table.locator("tr:has(td)");
  await bodyRows.first().locator("td").first().click();

  const tools = page.locator("#table-tools");
  await expect(tools).toBeVisible();

  await tools.getByRole("button", { name: "下方插入行" }).click();
  await expect(bodyRows).toHaveCount(3);

  await tools.getByRole("button", { name: "右侧插入列" }).click();
  await expect(table.locator("tr").first().locator("th, td")).toHaveCount(3);

  await tools.getByRole("button", { name: "删除当前列" }).click();
  await expect(table.locator("tr").first().locator("th, td")).toHaveCount(2);

  await tools.getByRole("button", { name: "删除当前行" }).click();
  await expect(bodyRows).toHaveCount(2);
});
