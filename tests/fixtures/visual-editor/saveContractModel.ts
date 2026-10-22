export type SaveStatus = "idle" | "saving" | "saved" | "error" | "conflict";

export interface SaveContractSnapshot {
  candidateText: string;
  diskText: string;
  dirty: boolean;
  editorRevision: number;
  diskRevision: number;
  saveStatus: SaveStatus;
}

export interface SaveFailure {
  kind: "write-failed";
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function createSaveContractHarness() {
  let candidateText = "";
  let diskText = "";
  let dirty = false;
  let editorRevision = 0;
  let diskRevision = 0;
  let baseDiskRevision = 0;
  let saveStatus: SaveStatus = "idle";
  let queue = Promise.resolve();

  function edit(nextText: string) {
    candidateText = nextText;
    editorRevision += 1;
    dirty = true;
    saveStatus = "idle";
  }

  function flush(delayMs: number, failure?: SaveFailure): Promise<void> {
    if (!dirty) return Promise.resolve();

    const revision = editorRevision;
    const text = candidateText;
    const operation = queue.then(async () => {
      const expectedDiskRevision = baseDiskRevision;
      saveStatus = "saving";
      await delay(delayMs);

      if (failure) {
        saveStatus = "error";
        throw new Error(failure.kind);
      }
      if (expectedDiskRevision !== diskRevision) {
        saveStatus = "conflict";
        throw new Error("content revision conflict");
      }

      diskText = text;
      diskRevision += 1;
      baseDiskRevision = diskRevision;
      if (editorRevision === revision) dirty = false;
      saveStatus = dirty ? "idle" : "saved";
    });

    queue = operation.catch(() => undefined);
    return operation;
  }

  function simulateExternalChange(nextText: string) {
    diskText = nextText;
    diskRevision += 1;
  }

  function snapshot(): SaveContractSnapshot {
    return {
      candidateText,
      diskText,
      dirty,
      editorRevision,
      diskRevision,
      saveStatus,
    };
  }

  return { edit, flush, simulateExternalChange, snapshot };
}
