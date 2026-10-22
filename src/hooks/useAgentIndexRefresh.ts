import { useCallback, useRef } from "react";
import { libraryService } from "../services/libraryService";
import { measureAsync } from "../utils/perf";

export function useAgentIndexRefresh() {
  const refreshRef = useRef<Promise<void> | null>(null);

  return useCallback(() => {
    if (!refreshRef.current) {
      refreshRef.current = measureAsync("refreshAgentIndex", async () => {
        await libraryService.refreshAgentIndex();
      }).finally(() => {
        refreshRef.current = null;
      });
    }
    return refreshRef.current;
  }, []);
}
