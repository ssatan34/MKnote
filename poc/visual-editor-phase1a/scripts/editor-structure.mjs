const EDITOR_STRUCTURE_FIELDS = Object.freeze([
  "rootChildCount",
  "descendantElementCount",
  "tableCount",
  "rowCount",
  "cellCount",
  "paragraphCount",
  "listItemCount",
  "headingCount",
 "imageCount",
 "textContentLength",
 "visibleDirectBlockCount",
 "hiddenDirectBlockCount",
]);

export function normalizeEditorStructure(raw) {
  const snapshot = {};

  for (const field of EDITOR_STRUCTURE_FIELDS) {
    const value = raw?.[field];
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${field} must be a non-negative integer`);
    }
    snapshot[field] = value;
  }

  return snapshot;
}
