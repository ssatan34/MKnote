import test from "node:test";
import assert from "node:assert/strict";
import { createSyncTick, createProtectedSyncTick } from "../src/utils/syncTick.ts";

test("overlapping timer/focus ticks share one operation, then use fresh dirty state", async () => {
  const pending: Array<(value: number) => void> = [];
  const dirty: boolean[] = [];
  const tick = createSyncTick((value: boolean) => {
    dirty.push(value);
    return new Promise<number>(resolve => pending.push(resolve));
  });
  const first = tick(false);
  const overlap = tick(false);
  assert.equal(dirty.length, 1);
  pending[0](7);
  assert.deepEqual(await Promise.all([first, overlap]), [7, 7]);
  const next = tick(true);
  pending[1](8);
  assert.equal(await next, 8);
  assert.deepEqual(dirty, [false, true]);
});

test("dirty state escalation queues one protected tick and never overlaps backend calls", async () => {
  const states: boolean[] = [];
  const completions: Array<() => void> = [];
  const tick = createSyncTick((dirty: boolean) => {
    states.push(dirty);
    return new Promise<number>(resolve => completions.push(() => resolve(states.length)));
  });
  const first = tick(false);
  const dirty = tick(true);
  const later = tick(false);
  assert.equal(dirty, later);
  assert.deepEqual(states, [false]);
  completions[0](); await first;
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(states, [false, true]);
  completions[1]();
  assert.equal(await dirty, 2);
});

test("protected follow-up still runs when the preceding clean tick fails", async () => {
  let reject!: (error: Error) => void;
  const states: boolean[] = [];
  const tick = createSyncTick((dirty: boolean) => {
    states.push(dirty);
    return dirty ? Promise.resolve("protected") : new Promise<string>((_, no) => { reject = no; });
  });
  const first = tick(false);
  const failure = assert.rejects(first, /offline/);
  const protectedTick = tick(true);
  reject(new Error("offline"));
  await failure;
  assert.equal(await protectedTick, "protected");
  assert.deepEqual(states, [false, true]);
});

test("failed ticks release the single-flight gate", async () => {
  let calls = 0;
  const tick = createSyncTick(async () => {
    if (++calls === 1) throw new Error("offline");
    return "ready";
  });
  await assert.rejects(tick(false), /offline/);
  assert.equal(await tick(false), "ready");
});

test("a delayed protection IPC cannot let a later clean tick overtake the dirty caller", async () => {
  let notify!: () => void;
  let complete!: (value: string) => void;
  const states: boolean[] = [];
  const tick = createProtectedSyncTick((dirty: boolean) => {
    states.push(dirty);
    return new Promise<string>(resolve => { complete = resolve; });
  }, () => new Promise<void>(resolve => { notify = resolve; }));
  const dirty = tick(true);
  const clean = tick(false);
  assert.deepEqual(states, [true]);
  notify(); complete("safe");
  assert.deepEqual(await Promise.all([dirty, clean]), ["safe", "safe"]);
});
