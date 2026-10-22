export function createLatestRequest() {
  let version = 0;
  return {
    invalidate() { version++; },
    async run<T>(load: () => Promise<T>, publish: (value: T) => void, settled?: () => void): Promise<T> {
      const current = ++version;
      try {
        const value = await load();
        if (current === version) publish(value);
        return value;
      } finally { if (current === version) settled?.(); }
    },
  };
}
