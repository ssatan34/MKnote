import assert from "node:assert/strict";
import test from "node:test";
import { createLatestRequest } from "../src/utils/latestRequest.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test("older search/directory results cannot overwrite a newer selection", async () => {
  const request = createLatestRequest();
  const a = deferred<string>(); const b = deferred<string>();
  let shown = ""; let settled = 0;
  const first = request.run(() => a.promise, value => { shown = value; }, () => settled++);
  const second = request.run(() => b.promise, value => { shown = value; }, () => settled++);
  b.resolve("new query"); await second;
  a.resolve("old query"); await first;
  assert.equal(shown, "new query");
  assert.equal(settled, 1);
});

test("closing a search or starting its debounce invalidates in-flight results", async () => {
  const request = createLatestRequest(); const task = deferred<string>();
  let shown = "closed";
  const pending = request.run(() => task.promise, value => { shown = value; });
  request.invalidate(); task.resolve("late"); await pending;
  assert.equal(shown, "closed");
});

test("an older failed request cannot clear the current loading indicator", async () => {
  const request = createLatestRequest(); const a = deferred<string>(); const b = deferred<string>();
  let loading = true;
  const first = request.run(() => a.promise, () => {}, () => { loading = false; });
  const failed = assert.rejects(first, /failed/);
  const second = request.run(() => b.promise, () => {}, () => { loading = false; });
  a.reject(new Error("failed")); await failed;
  assert.equal(loading, true);
  b.resolve("done"); await second;
  assert.equal(loading, false);
});
