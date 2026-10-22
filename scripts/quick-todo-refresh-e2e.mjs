import assert from 'node:assert/strict';
import fs from 'node:fs';
const { chromium } = await import(process.env.MKN_PLAYWRIGHT_MODULE ?? 'playwright');
const browser = await chromium.launch({ headless:true });
const result = {pass:false, checks:[]};
try {
  const page = await browser.newPage();
  await page.goto(`${process.env.MKN_TEST_URL ?? 'http://127.0.0.1:5194'}/tests/fixtures/quickTodoController.html`);
  await page.waitForFunction(() => window.hookTest?.reads === 1);
  await page.evaluate(() => window.hookTest.waiters.shift()([]));
  await page.waitForFunction(() => !window.hookTest.controller.loading);
  await page.waitForFunction(() => window.hookTest.reads >= 2);
  const before = await page.evaluate(() => window.hookTest.reads);
  await page.waitForTimeout(4500);
  assert.equal(await page.evaluate(() => window.hookTest.reads), before, 'polling must not supersede in-flight slow reads');
  await page.evaluate(() => {
    window.hookTest.waiters.shift()([]);
    window.hookTest.pendingWrite = window.hookTest.controller.add('manual',null);
  });
  const readsBeforeWrite = await page.evaluate(() => window.hookTest.reads);
  await page.waitForTimeout(2500);
  assert.equal(await page.evaluate(() => window.hookTest.reads), readsBeforeWrite, 'polling waits for pending mutations');
  await page.evaluate(() => window.hookTest.finishWrite([]));
  await page.evaluate(() => window.hookTest.pendingWrite);
  result.checks.push('slow reads do not overlap or starve','pending mutations block polling');
  result.pass = true;
} catch(error) {result.error=String(error.stack??error);} finally {await browser.close();}
fs.mkdirSync('.codex-smoke',{recursive:true});
fs.writeFileSync('.codex-smoke/quick-todo-refresh.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
process.exitCode=result.pass?0:1;
