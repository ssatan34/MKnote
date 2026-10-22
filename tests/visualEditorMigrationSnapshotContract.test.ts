import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repositoryRoot = join(import.meta.dirname, "..");

test("visual editor must prepare a protected migration snapshot before Beta writes", () => {
  const notesService = readFileSync(
    join(repositoryRoot, "src", "services", "notesService.ts"),
    "utf8",
  );
  const editorPane = readFileSync(
    join(repositoryRoot, "src", "components", "compact", "EditorPane.tsx"),
    "utf8",
  );
  const lifecycleScript = readFileSync(
    join(repositoryRoot, "scripts", "visual-editor-phase2-lifecycle-e2e.mjs"),
    "utf8",
  );
  const visualEditor = readFileSync(
    join(repositoryRoot, "src", "components", "VisualEditor.tsx"),
    "utf8",
  );

  assert.match(notesService, /ensureVisualEditorMigrationSnapshot/);
  assert.match(editorPane, /onPrepareMigrationSnapshot/);
  assert.match(visualEditor, /onPrepareMigrationSnapshot/);
  assert.match(visualEditor, /await onPrepareMigrationSnapshotRef\.current\?\.\(\)/);
  assert.match(visualEditor, /data-editor-ready/);
  assert.match(lifecycleScript, /waitForMigrationSnapshot/);
  assert.match(lifecycleScript, /mknote-migration-snapshots/);
});

test("switching notes must await the snapshot before loading the new note", () => {
  const visualEditor = readFileSync(
    join(repositoryRoot, "src", "components", "VisualEditor.tsx"),
    "utf8",
  );
  const switchStart = visualEditor.indexOf(
    "const noteChanged = noteKey !== activeNoteRef.current",
  );
  const effectEnd = visualEditor.indexOf(
    "}, [content, contentRevision, noteKey]);",
    switchStart,
  );

  assert.ok(switchStart >= 0, "必须保留 note switch 分支");
  assert.ok(effectEnd > switchStart, "必须能定位 note switch 分支边界");

  const switchSource = visualEditor.slice(switchStart, effectEnd);
  assert.match(
    switchSource,
    /await onPrepareMigrationSnapshotRef\.current\?\.\(\)/,
  );
  assert.match(
    switchSource,
    /if \(noteChanged\)\s*\{[\s\S]*?await onPrepareMigrationSnapshotRef\.current\?\.\(\)/,
  );
  assert.match(
    switchSource,
    /await onPrepareMigrationSnapshotRef\.current\?\.\(\)[\s\S]*?await session\.loadNote\(noteKey, content\)/,
  );
});
