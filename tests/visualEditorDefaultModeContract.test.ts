import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repositoryRoot = join(import.meta.dirname, "..");
const sessionStateSource = readFileSync(
  join(repositoryRoot, "src", "hooks", "useNoteSessionState.ts"),
  "utf8",
);

test("普通笔记的新会话默认进入预览模式", () => {
  assert.match(
    sessionStateSource,
    /useState<ViewMode>\("preview"\)/,
    "Phase 4 默认体验必须直接进入 visual editor 所在的 preview 模式",
  );
});
