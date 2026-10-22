export type VisualEditorMode = "legacy-preview" | "visual-prosemirror" | "safe-source";

export interface VisualEditorAvailability {
  mode: VisualEditorMode;
  viewMode: "edit" | "preview";
  privateModeActive: boolean;
  privacyMask: boolean;
}

export function resolveVisualEditorMode(value: string | undefined): VisualEditorMode {
  if (value === "legacy-preview" || value === "safe-source") return value;
  return "visual-prosemirror";
}

export function shouldUseVisualEditor({
  mode,
  viewMode,
  privateModeActive,
  privacyMask,
}: VisualEditorAvailability): boolean {
  return mode === "visual-prosemirror" && viewMode === "preview" && !privateModeActive && !privacyMask;
}
