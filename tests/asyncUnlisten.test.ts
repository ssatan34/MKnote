import assert from "node:assert/strict";
import test from "node:test";
import { createAsyncUnlistenCleanup } from "../src/utils/asyncUnlisten.ts";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test("注册尚未完成时清理，注册完成后仍只调用一次 unlisten", async () => {
  const registration = deferred<() => void>();
  let calls = 0;
  const cleanup = createAsyncUnlistenCleanup(registration.promise);

  cleanup();
  cleanup();
  registration.resolve(() => {
    calls += 1;
  });
  await registration.promise;
  await Promise.resolve();

  assert.equal(calls, 1);
});

test("注册完成后清理立即生效，重复清理不重复注销", async () => {
  let calls = 0;
  const cleanup = createAsyncUnlistenCleanup(Promise.resolve(() => {
    calls += 1;
  }));

  await Promise.resolve();
  cleanup();
  cleanup();

  assert.equal(calls, 1);
});

test("监听注册失败时清理安全完成", async () => {
  const cleanup = createAsyncUnlistenCleanup(Promise.reject(new Error("register failed")));

  cleanup();
  await new Promise((resolve) => setImmediate(resolve));
});

test("unlisten 抛错不会泄漏为未处理异常", async () => {
  const cleanup = createAsyncUnlistenCleanup(Promise.resolve(() => {
    throw new Error("unregister failed");
  }));

  await Promise.resolve();
  cleanup();
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(true);
});

test("unlisten 返回 rejected Promise 时也不会泄漏为未处理异常", async () => {
  const cleanup = createAsyncUnlistenCleanup(Promise.resolve(() =>
    Promise.reject(new Error("async unregister failed")),
  ));

  await Promise.resolve();
  cleanup();
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(true);
});
