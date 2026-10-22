export interface EditorSelection {
  from: number;
  to: number;
}

export interface ClipboardPayload {
  text: string;
}

export type EditorSaveStatus = "idle" | "saved" | "error";

export interface EditorInteractionSnapshot {
  content: string;
  selection: EditorSelection;
  undoDepth: number;
  redoDepth: number;
  dirty: boolean;
  saveStatus: EditorSaveStatus;
  error: string | null;
}

export type EditorCommand =
  | { type: "replace-selection"; text: string }
  | { type: "undo" }
  | { type: "redo" };

interface EditorState {
  content: string;
  selection: EditorSelection;
}

function cloneSelection(selection: EditorSelection): EditorSelection {
  return { from: selection.from, to: selection.to };
}

function cloneState(state: EditorState): EditorState {
  return { content: state.content, selection: cloneSelection(state.selection) };
}

function assertValidSelection(selection: EditorSelection, contentLength: number): void {
  if (
    !Number.isInteger(selection.from) ||
    !Number.isInteger(selection.to) ||
    selection.from < 0 ||
    selection.to < selection.from ||
    selection.to > contentLength
  ) {
    throw new RangeError("selection is outside the editor content");
  }
}

function replaceRange(state: EditorState, text: string): EditorState {
  const { from, to } = state.selection;
  const content = `${state.content.slice(0, from)}${text}${state.content.slice(to)}`;
  const caret = from + text.length;
  return { content, selection: { from: caret, to: caret } };
}

class EditorInteractionHarness {
  private state: EditorState;
  private undoStack: EditorState[] = [];
  private redoStack: EditorState[] = [];
  private compositionBase: EditorState | null = null;
  private dirty = false;
  private saveStatus: EditorSaveStatus = "idle";
  private error: string | null = null;

  constructor(content: string) {
    this.state = { content, selection: { from: 0, to: 0 } };
  }

  setSelection(selection: EditorSelection): void {
    assertValidSelection(selection, this.state.content.length);
    this.state.selection = cloneSelection(selection);
  }

  replaceSelection(text: string): void {
    if (this.compositionBase) {
      throw new Error("cannot replace selection during composition");
    }
    const before = cloneState(this.state);
    this.state = replaceRange(this.state, text);
    if (before.content !== this.state.content) {
      this.undoStack.push(before);
      this.redoStack = [];
      this.markEdited();
    }
  }

  executeCommand(command: EditorCommand): void {
    if (command.type === "replace-selection") {
      this.replaceSelection(command.text);
    } else if (command.type === "undo") {
      this.undo();
    } else {
      this.redo();
    }
  }

  beginComposition(): void {
    if (this.compositionBase) {
      throw new Error("composition is already active");
    }
    this.compositionBase = cloneState(this.state);
  }

  updateComposition(text: string): void {
    if (!this.compositionBase) {
      throw new Error("composition is not active");
    }
    this.state = replaceRange(this.compositionBase, text);
    this.markEdited();
  }

  endComposition(): void {
    if (!this.compositionBase) {
      throw new Error("composition is not active");
    }
    if (this.compositionBase.content !== this.state.content) {
      this.undoStack.push(this.compositionBase);
      this.redoStack = [];
    }
    this.compositionBase = null;
  }

  copySelection(): ClipboardPayload {
    const { from, to } = this.state.selection;
    return { text: this.state.content.slice(from, to) };
  }

  paste(payload: ClipboardPayload): void {
    this.replaceSelection(payload.text);
  }

  undo(): void {
    const previous = this.undoStack.pop();
    if (!previous) return;
    this.redoStack.push(cloneState(this.state));
    this.state = cloneState(previous);
    this.markEdited();
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(cloneState(this.state));
    this.state = cloneState(next);
    this.markEdited();
  }

  failSerialization(message: string): void {
    this.saveStatus = "error";
    this.error = message;
  }

  clearSaveError(): void {
    this.error = null;
    this.saveStatus = this.dirty ? "idle" : "saved";
  }

  snapshot(): EditorInteractionSnapshot {
    return {
      content: this.state.content,
      selection: cloneSelection(this.state.selection),
      undoDepth: this.undoStack.length,
      redoDepth: this.redoStack.length,
      dirty: this.dirty,
      saveStatus: this.saveStatus,
      error: this.error,
    };
  }

  private markEdited(): void {
    this.dirty = true;
    this.saveStatus = "idle";
    this.error = null;
  }
}

export function createEditorInteractionHarness(content: string): EditorInteractionHarness {
  return new EditorInteractionHarness(content);
}
