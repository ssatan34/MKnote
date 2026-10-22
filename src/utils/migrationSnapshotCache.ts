/** Remember successful preparations only; a failure must allow a later retry. */
export function createMigrationSnapshotCache(
  prepare: (zone: string, name: string) => Promise<void>,
): (zone: string, name: string) => Promise<void> {
  const preparations = new Map<string, Promise<void>>();

  return (zone, name) => {
    const key = JSON.stringify([zone, name]);
    const existing = preparations.get(key);
    if (existing) return existing;

    const preparation = prepare(zone, name).catch((error: unknown) => {
      preparations.delete(key);
      throw error;
    });
    preparations.set(key, preparation);
    return preparation;
  };
}
