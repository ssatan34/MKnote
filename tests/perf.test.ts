import assert from "node:assert/strict";
import test from "node:test";

import { measureBlocking } from "../src/utils/perf.ts";

test("measureBlocking records only the synchronous bridge-call window", () => {
  const originalWindow = (globalThis as { window?: unknown }).window;
  const originalDebug = console.debug;
  const messages: string[] = [];

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: { getItem: (key: string) => (key === "mkPerf" ? "1" : null) } },
  });
  console.debug = (...args: unknown[]) => {
    messages.push(args.map(String).join(" "));
  };

  try {
    const result = measureBlocking("invoke:write_note_checked", () => "queued");

    assert.equal(result, "queued");
    assert.equal(messages.length, 1);
    assert.match(messages[0], /^\[mk-perf-blocking\] /);
    const payload = JSON.parse(messages[0].replace(/^\[mk-perf-blocking\] /, "")) as {
      label: string;
      blockingMs: number;
      status: string;
    };
    assert.equal(payload.label, "invoke:write_note_checked");
    assert.equal(payload.status, "ok");
    assert.equal(Number.isFinite(payload.blockingMs), true);
    assert.equal(payload.blockingMs >= 0, true);
  } finally {
    console.debug = originalDebug;
    if (originalWindow === undefined) {
      Reflect.deleteProperty(globalThis, "window");
    } else {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
      });
    }
  }
});

test("measureBlocking rethrows synchronous bridge errors and records an error sample", () => {
  const originalWindow = (globalThis as { window?: unknown }).window;
  const originalWarn = console.warn;
  const messages: string[] = [];

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: { getItem: () => "1" } },
  });
  console.warn = (...args: unknown[]) => {
    messages.push(args.map(String).join(" "));
  };

  try {
    assert.throws(
      () => measureBlocking("invoke:write_note_checked", () => {
        throw new Error("bridge dispatch failed");
      }),
      /bridge dispatch failed/,
    );
    assert.equal(messages.length, 1);
    const payload = JSON.parse(messages[0].replace(/^\[mk-perf-blocking\] /, "")) as {
      status: string;
      blockingMs: number;
    };
    assert.equal(payload.status, "error");
    assert.equal(Number.isFinite(payload.blockingMs), true);
  } finally {
    console.warn = originalWarn;
    if (originalWindow === undefined) {
      Reflect.deleteProperty(globalThis, "window");
    } else {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
      });
    }
  }
});
