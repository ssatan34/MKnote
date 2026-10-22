import { expect, test } from "@playwright/test";

test("块引用快捷键包装当前段落并保持 Markdown 序列化与撤销", async ({ page }) => {
  await page.goto("/");

  const editor = page.locator(".ProseMirror");
  const paragraph = editor
    .locator("p")
    .filter({ hasText: "这是一份不连接生产保存的临时文档" })
    .first();

  await paragraph.click();
  await page.keyboard.press("Control+Shift+B");

  await expect(editor.locator("blockquote p")).toContainText(
    "这是一份不连接生产保存的临时文档",
  );
  await expect(page.locator("#markdown-output")).toContainText(
    "> 这是一份不连接生产保存的临时文档",
  );

  await page.keyboard.press("Control+Z");
  await expect(editor.locator("blockquote")).toHaveCount(0);

  await page.keyboard.press("Control+Y");
  await expect(editor.locator("blockquote p")).toContainText(
    "这是一份不连接生产保存的临时文档",
  );
});
