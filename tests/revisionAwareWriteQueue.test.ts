import assert from "node:assert/strict";
import test from "node:test";
import { createRevisionAwareWriteQueue } from "../src/utils/revisionAwareWriteQueue.ts";

interface TestRevision {
  contentHash: string;
  modifiedMs: number;
}

test("连续写入同一笔记时，后续写入沿用前一次成功返回的 hash", async () => {
  const calls: Array<{ text: string; expectedContentHash?: string; editorRevision: number }> = [];
  const writeQueue = createRevisionAwareWriteQueue<TestRevision>(async (save) => {
    calls.push({
      text: save.text,
      expectedContentHash: save.expectedContentHash,
      editorRevision: save.editorRevision,
    });
    await new Promise((resolve) => setTimeout(resolve, save.text === "第一版" ? 10 : 0));
    return { contentHash: `hash:${save.text}`, modifiedMs: calls.length };
  });

  await Promise.all([
    writeQueue.enqueue("default::note.md", {
      text: "第一版",
      expectedContentHash: "hash:磁盘初始版本",
      editorRevision: 1,
    }),
    writeQueue.enqueue("default::note.md", {
      text: "第二版",
      expectedContentHash: "hash:磁盘初始版本",
      editorRevision: 2,
    }),
  ]);

  assert.deepEqual(calls, [
    { text: "第一版", expectedContentHash: "hash:磁盘初始版本", editorRevision: 1 },
    { text: "第二版", expectedContentHash: "hash:第一版", editorRevision: 2 },
  ]);
});

test("写入冲突会向调用方传播，且不会伪造新的 revision", async () => {
  const writeQueue = createRevisionAwareWriteQueue<TestRevision>(async () => {
    throw new Error("便签已被外部修改");
  });

  await assert.rejects(
    writeQueue.enqueue("default::note.md", {
      text: "本地版本",
      expectedContentHash: "hash:旧版本",
      editorRevision: 1,
    }),
    /外部修改/,
  );
});
