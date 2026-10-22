import type { QuickPocketSnapshot, QuickPocketTag } from "./quickPocketModel";
import type { QuickPocketDefinition } from "./quickPocketRegistry.ts";
import { DEFAULT_QUICK_POCKET_ID } from "./quickPocketRegistry.ts";

type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
type Listen = (event: string, handler: () => void) => Promise<() => void>;

export function createQuickPocketService(invoke: Invoke, listen: Listen) {
  return {
    listPockets: () => invoke<QuickPocketDefinition[]>("quick_pocket_registry_list"),
    createPocket: (name: string) => invoke<QuickPocketDefinition>("quick_pocket_create", { name }),
    renamePocket: (pocketId: string, name: string) => invoke<QuickPocketDefinition>("quick_pocket_rename", { pocketId, name }),
    deletePocket: (pocketId: string) => invoke<QuickPocketDefinition[]>("quick_pocket_delete_pocket", { pocketId }),
    list: (pocketId = DEFAULT_QUICK_POCKET_ID) => invoke<QuickPocketSnapshot>("quick_pocket_list", { pocketId }),
    add: (title: string, body: string, tag: QuickPocketTag | null, groupId: string | null, pocketId = DEFAULT_QUICK_POCKET_ID) => invoke<QuickPocketSnapshot>("quick_pocket_add", { title, body, tag, groupId, pocketId }),
    update: (id: string, title: string, body: string, tag: QuickPocketTag | null, pocketId = DEFAULT_QUICK_POCKET_ID) => invoke<QuickPocketSnapshot>("quick_pocket_update", { id, title, body, tag, pocketId }),
    delete: (id: string, pocketId = DEFAULT_QUICK_POCKET_ID) => invoke<QuickPocketSnapshot>("quick_pocket_delete", { id, pocketId }),
    reorder: (ids: string[], pocketId = DEFAULT_QUICK_POCKET_ID) => invoke<QuickPocketSnapshot>("quick_pocket_reorder", { ids, pocketId }),
    createGroup: (ids: string[], name: string, pocketId = DEFAULT_QUICK_POCKET_ID) => invoke<QuickPocketSnapshot>("quick_pocket_create_group", { ids, name, pocketId }),
    renameGroup: (id: string, name: string, pocketId = DEFAULT_QUICK_POCKET_ID) => invoke<QuickPocketSnapshot>("quick_pocket_rename_group", { id, name, pocketId }),
    dissolveGroup: (id: string, pocketId = DEFAULT_QUICK_POCKET_ID) => invoke<QuickPocketSnapshot>("quick_pocket_dissolve_group", { id, pocketId }),
    moveItem: (id: string, groupId: string | null, ids: string[], pocketId = DEFAULT_QUICK_POCKET_ID) => invoke<QuickPocketSnapshot>("quick_pocket_move_item", { id, groupId, ids, pocketId }),
    onChanged: (handler: () => void, pocketId = DEFAULT_QUICK_POCKET_ID) => listen(`mknote:quick-pocket-changed:${pocketId}`, handler),
  };
}
