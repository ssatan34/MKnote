export function createSyncTick<T>(run: (editorDirty: boolean) => Promise<T>) {
  let pending: Promise<T> | null = null;
  let runningDirty = false;
  let queued: Promise<T> | null = null;
  return (editorDirty: boolean): Promise<T> => {
    // A dirty notification schedules a protected follow-up; an already-issued
    // backend request cannot be cancelled by this frontend gate.
    if (queued) return queued;
    if (pending && editorDirty && !runningDirty) {
      const startProtected = () => {
        runningDirty = true;
        pending = Promise.resolve().then(() => run(true)).finally(() => { pending = null; });
        return pending;
      };
      queued = pending.then(startProtected, startProtected).finally(() => { queued = null; });
      return queued;
    }
    if (!pending) {
      runningDirty = editorDirty;
      pending = run(editorDirty).finally(() => { pending = null; });
    }
    return pending;
  };
}

export function createProtectedSyncTick<T>(run: (editorDirty: boolean) => Promise<T>, protect: () => Promise<void>) {
  const tick = createSyncTick(run);
  return (dirty: boolean): Promise<T> => {
    if (!dirty) return tick(false);
    const notification = protect();
    // Reserve the dirty tick synchronously. Waiting for IPC first would let a
    // later clean caller jump ahead and capture an already-advanced epoch.
    const result = tick(true);
    return Promise.all([notification, result]).then(([, value]) => value);
  };
}
