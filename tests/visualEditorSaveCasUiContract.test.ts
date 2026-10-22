import assert from "node:assert/strict";
import test from "node:test";

import { parseBlockingConsoleMessage } from "../scripts/visual-editor-save-cas-console.mjs";

test("保存/CAS 采集只接受结构化 blocking 日志", () => {
  assert.deepEqual(
    parseBlockingConsoleMessage(
      '[mk-perf-blocking] {"label":"invoke:write_note_checked","blockingMs":2.5,"status":"ok"}',
    ),
    { label: "invoke:write_note_checked", blockingMs: 2.5, status: "ok" },
  );
  assert.equal(parseBlockingConsoleMessage("[mk-perf] invoke:write_note_checked 300ms"), null);
  assert.equal(
    parseBlockingConsoleMessage(
      '[mk-perf-blocking] {"label":"invoke:write_note_checked","blockingMs":-1,"status":"ok"}',
    ),
    null,
  );
  assert.equal(
    parseBlockingConsoleMessage(
      '[mk-perf-blocking] {"label":"invoke:read_note","blockingMs":1,"status":"ok"}',
    ),
    null,
  );
});
