import assert from "node:assert/strict";
import test from "node:test";
import { isRootDefaultNote } from "../src/utils/noteWriteTarget.ts";

test("同名普通便签不能被误判为根目录默认便签", () => {
  assert.equal(
    isRootDefaultNote({
      zone: "default",
      name: "default-note.md",
      defaultNoteOpen: false,
    }),
    false,
  );
});

test("显式打开根目录默认便签时才使用根目录写入路径", () => {
  assert.equal(
    isRootDefaultNote({
      zone: "default",
      name: "default-note.md",
      defaultNoteOpen: true,
    }),
    true,
  );
});

test("其他文件名或区域始终使用所在区域写入路径", () => {
  assert.equal(
    isRootDefaultNote({
      zone: "default",
      name: "meeting.md",
      defaultNoteOpen: true,
    }),
    false,
  );
  assert.equal(
    isRootDefaultNote({
      zone: "inbox",
      name: "default-note.md",
      defaultNoteOpen: true,
    }),
    false,
  );
});
