import { expect, test } from "@playwright/test";

test("代码块输入规则创建代码块并保持 Markdown 序列化", async ({ page }) => {
  await page.goto("/");

  const editor = page.locator(".ProseMirror");
  const paragraph = editor
    .locator("p")
    .filter({ hasText: "这是一份不连接生产保存的临时文档" })
    .first();

  await paragraph.click();
  await page.keyboard.press("Home");
  await page.keyboard.insertText("```");
  await page.keyboard.press("Space");
  await expect(editor.locator("pre code")).toBeVisible();

  await page.keyboard.insertText("const answer = 42;");
  await expect(editor.locator("pre code")).toContainText("const answer = 42;");
  await expect(page.locator("#markdown-output")).toContainText("```");
  await expect(page.locator("#markdown-output")).toContainText("const answer = 42;");
});
