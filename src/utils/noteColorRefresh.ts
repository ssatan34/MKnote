import { createLatestRequest } from "./latestRequest.ts";

/** Shared by standalone color refreshes and full library refreshes. */
export function createNoteColorRefresh<T>(load: () => Promise<T>, publish: (colors: T) => void) {
  const request = createLatestRequest();
  return {
    refresh: () => request.run(load, publish),
    invalidate: () => request.invalidate(),
  };
}
