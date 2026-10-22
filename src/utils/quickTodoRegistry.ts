export const DEFAULT_QUICK_TODO_ID = "default";
export const MAX_QUICK_TODO_NAME_LENGTH = 6;

export interface QuickTodoDefinition {
  id: string;
  name: string;
}

export const DEFAULT_QUICK_TODO: QuickTodoDefinition = {
  id: DEFAULT_QUICK_TODO_ID,
  name: "Quick Todo",
};

export function mergeQuickTodoDefinitions(definitions: QuickTodoDefinition[]): QuickTodoDefinition[] {
  const seen = new Set([DEFAULT_QUICK_TODO_ID]);
  return [
    DEFAULT_QUICK_TODO,
    ...definitions.filter((definition) => {
      if (seen.has(definition.id)) return false;
      seen.add(definition.id);
      return true;
    }),
  ];
}

export function isValidQuickTodoName(name: string): boolean {
  const normalized = name.trim();
  return normalized.length > 0 && Array.from(normalized).length <= MAX_QUICK_TODO_NAME_LENGTH;
}
