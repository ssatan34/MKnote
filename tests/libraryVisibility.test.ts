import assert from "node:assert/strict";
import test from "node:test";
import { filterLibraryNotes } from "../src/utils/libraryVisibility.ts";

test("资料库永久隐藏 Quick Todo 与 Quick Pocket 系统笔记", () => {
  const notes = [
    { name: "Quick Todo.md", title: "Quick Todo" },
    { name: "Quick Pocket.md", title: "Quick Pocket" },
    { name: "Quick Todo ideas.md", title: "Quick Todo ideas" },
    { name: "项目记录.md", title: "项目记录" },
  ];

  assert.deepEqual(
    filterLibraryNotes(notes).map((note) => note.name),
    ["Quick Todo ideas.md", "项目记录.md"],
  );
});
