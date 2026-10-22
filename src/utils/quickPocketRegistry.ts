export const DEFAULT_QUICK_POCKET_ID = "default";
export const MAX_QUICK_POCKET_NAME_LENGTH = 6;

export interface QuickPocketDefinition {
  id: string;
  name: string;
}

export const DEFAULT_QUICK_POCKET: QuickPocketDefinition = {
  id: DEFAULT_QUICK_POCKET_ID,
  name: "Quick Pocket",
};

export function isValidQuickPocketName(name: string): boolean {
  const normalized = name.trim();
  return normalized.length > 0 && Array.from(normalized).length <= MAX_QUICK_POCKET_NAME_LENGTH;
}

export function mergeQuickPocketDefinitions(definitions: QuickPocketDefinition[]): QuickPocketDefinition[] {
  const seen = new Set<string>([DEFAULT_QUICK_POCKET_ID]);
  return [
    DEFAULT_QUICK_POCKET,
    ...definitions.filter((definition) => {
      if (!definition.id || seen.has(definition.id)) return false;
      seen.add(definition.id);
      return true;
    }),
  ];
}
