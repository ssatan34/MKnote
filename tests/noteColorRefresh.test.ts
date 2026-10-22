import test from "node:test";
import assert from "node:assert/strict";
import { createNoteColorRefresh } from "../src/utils/noteColorRefresh.ts";

test("standalone and library color requests share ordering, including unmount", async () => {
  const finish: Array<(colors: string[]) => void> = [];
  let shown: string[] = [];
  const colors = createNoteColorRefresh(
    () => new Promise<string[]>(resolve => finish.push(resolve)),
    value => { shown = value; },
  );
  const library = Promise.all([Promise.resolve("folders"), colors.refresh()]);
  const standalone = colors.refresh();
  finish[1](["new"]); await standalone;
  finish[0](["old"]); await library;
  assert.deepEqual(shown, ["new"]);
  const detached = colors.refresh(); colors.invalidate();
  finish[2](["unmounted"]); await detached;
  assert.deepEqual(shown, ["new"]);
});
