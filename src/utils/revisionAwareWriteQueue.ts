export interface RevisionAwareWrite {
  text: string;
  expectedContentHash?: string;
  editorRevision: number;
}

interface QueueEntry<Write, Revision> {
  pending: Write | null;
  promise: Promise<Revision> | null;
}

export function createRevisionAwareWriteQueue<
  Revision extends { contentHash: string },
  Write extends RevisionAwareWrite = RevisionAwareWrite,
>(write: (save: Write) => Promise<Revision>) {
  const queues = new Map<string, QueueEntry<Write, Revision>>();

  const drain = async (key: string, entry: QueueEntry<Write, Revision>): Promise<Revision> => {
    let expectedContentHash = entry.pending?.expectedContentHash;
    let lastRevision: Revision | null = null;

    try {
      while (entry.pending) {
        const next = entry.pending;
        entry.pending = null;
        const revision = await write({ ...next, expectedContentHash } as Write);
        lastRevision = revision;
        expectedContentHash = revision.contentHash;
      }

      if (!lastRevision) {
        throw new Error("保存队列没有可写入内容");
      }
      return lastRevision;
    } finally {
      if (queues.get(key) === entry) {
        queues.delete(key);
      }
    }
  };

  return {
    enqueue(key: string, save: Write): Promise<Revision> {
      let entry = queues.get(key);
      if (!entry) {
        entry = { pending: null, promise: null };
        queues.set(key, entry);
      }

      entry.pending = save;
      if (!entry.promise) {
        entry.promise = drain(key, entry);
      }
      return entry.promise;
    },
  };
}
