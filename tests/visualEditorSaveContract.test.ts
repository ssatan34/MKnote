import assert from "node:assert/strict";
import test from "node:test";
import { createSaveContractHarness } from "./fixtures/visual-editor/saveContractModel.ts";

const DELAYS_MS = [0, 200, 1000] as const;
const NAVIGATION_EVENTS = [
  "tab",
  "popout",
  "capsule",
  "private",
  "hide",
  "exit",
] as const;

for (const delayMs of DELAYS_MS) {
  test(`保存契约：${delayMs}ms 延迟时新 revision 不会被旧写入清 dirty`, async () => {
    const harness = createSaveContractHarness();

    harness.edit("第一版");
    const firstWrite = harness.flush(delayMs);
    harness.edit("第二版");
    const secondWrite = harness.flush(delayMs);

    await Promise.all([firstWrite, secondWrite]);

    assert.equal(harness.snapshot().diskText, "第二版");
    assert.equal(harness.snapshot().dirty, false);
    assert.equal(harness.snapshot().saveStatus, "saved");
  });
}

test("保存调用必须捕获调用时的 revision 和文本，而不是队列执行时的最新内容", async () => {
  const harness = createSaveContractHarness();

  harness.edit("第一版");
  const firstWrite = harness.flush(20);
  harness.edit("第二版");
  const secondWrite = harness.flush(0);

  await firstWrite;
  assert.equal(harness.snapshot().diskText, "第一版");
  assert.equal(harness.snapshot().dirty, true);

  await secondWrite;
  assert.equal(harness.snapshot().diskText, "第二版");
  assert.equal(harness.snapshot().dirty, false);
});

test("保存失败必须保留 dirty，并允许后续重试", async () => {
  const harness = createSaveContractHarness();
  harness.edit("待保存内容");

  await assert.rejects(harness.flush(200, { kind: "write-failed" }));
  assert.equal(harness.snapshot().diskText, "");
  assert.equal(harness.snapshot().dirty, true);
  assert.equal(harness.snapshot().saveStatus, "error");

  await harness.flush(0);
  assert.equal(harness.snapshot().diskText, "待保存内容");
  assert.equal(harness.snapshot().dirty, false);
  assert.equal(harness.snapshot().saveStatus, "saved");
});

for (const event of NAVIGATION_EVENTS) {
  test(`保存契约：${event} 事件必须等待最新 revision flush`, async () => {
    const harness = createSaveContractHarness();
    harness.edit(`${event}-内容`);

    await harness.flush(1000);

    assert.equal(harness.snapshot().diskText, `${event}-内容`);
    assert.equal(harness.snapshot().dirty, false);
  });
}

test("外部版本冲突不得覆盖磁盘且必须保留可恢复的 dirty 状态", async () => {
  const harness = createSaveContractHarness();
  harness.edit("本地编辑");
  harness.simulateExternalChange("外部编辑");

  await assert.rejects(harness.flush(0));

  assert.equal(harness.snapshot().diskText, "外部编辑");
  assert.equal(harness.snapshot().dirty, true);
  assert.equal(harness.snapshot().saveStatus, "conflict");
});
