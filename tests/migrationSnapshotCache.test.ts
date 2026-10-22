import test from "node:test";
import assert from "node:assert/strict";
import { createMigrationSnapshotCache } from "../src/utils/migrationSnapshotCache.ts";

test("首次准备完成前所有调用等待同一份备份，成功后不重复准备", async () => {
  let finish!: () => void;
  let calls = 0;
  const prepare = createMigrationSnapshotCache(() => {
    calls += 1;
    return new Promise<void>((resolve) => { finish = resolve; });
  });
  const first = prepare("default", "one.md");
  const second = prepare("default", "one.md");
  assert.equal(first, second);
  let ready = false;
  void second.then(() => { ready = true; });
  await Promise.resolve();
  assert.equal(ready, false);
  finish();
  await first;
  await prepare("default", "one.md");
  assert.equal(calls, 1);
});

test("备份失败必须传给调用方，下一次可重试且只缓存成功", async () => {
  let calls = 0;
  const prepare = createMigrationSnapshotCache(async () => {
    if (++calls === 1) throw new Error("backup unavailable");
  });
  await assert.rejects(prepare("default", "one.md"), /backup unavailable/);
  await prepare("default", "one.md");
  await prepare("default", "one.md");
  assert.equal(calls, 2);
});

test("不同分区或名称独立准备，新会话再次确认磁盘备份", async () => {
  const calls: string[][] = [];
  const invoke = async (zone: string, name: string) => { calls.push([zone, name]); };
  const prepare = createMigrationSnapshotCache(invoke);
  await prepare("default", "one.md");
  await prepare("inbox", "one.md");
  await prepare("default", "two.md");
  const nextSession = createMigrationSnapshotCache(invoke);
  await nextSession("default", "one.md");
  assert.deepEqual(calls, [["default", "one.md"], ["inbox", "one.md"], ["default", "two.md"], ["default", "one.md"]]);
});
