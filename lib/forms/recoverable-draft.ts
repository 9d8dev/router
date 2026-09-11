import { z } from "zod";
import { formDraftDefinitionV1Schema } from "./definition";

const recoverableFormDraftSchema = z.object({
  version: z.literal(1),
  formId: z.string().min(1),
  baseRevision: z.number().int().positive(),
  name: z.string().max(120),
  definition: formDraftDefinitionV1Schema,
  updatedAt: z.string().datetime(),
});

export type RecoverableFormDraft = z.infer<typeof recoverableFormDraftSchema>;

type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function storageKey(formId: string): string {
  return `router-form-draft:${formId}`;
}

export function storeRecoverableFormDraft(
  storage: DraftStorage,
  draft: Omit<RecoverableFormDraft, "version">
): boolean {
  try {
    const parsed = recoverableFormDraftSchema.parse({ version: 1, ...draft });
    storage.setItem(storageKey(draft.formId), JSON.stringify(parsed));
    return true;
  } catch {
    return false;
  }
}

export function readRecoverableFormDraft(
  storage: DraftStorage,
  formId: string
): RecoverableFormDraft | null {
  const key = storageKey(formId);
  try {
    const serialized = storage.getItem(key);
    if (!serialized) return null;
    const parsed = recoverableFormDraftSchema.parse(JSON.parse(serialized));
    if (parsed.formId !== formId) throw new Error("Draft belongs to another form.");
    return parsed;
  } catch {
    try {
      storage.removeItem(key);
    } catch {
      // Storage can be unavailable in privacy-restricted browser contexts.
    }
    return null;
  }
}

export function clearRecoverableFormDraft(
  storage: DraftStorage,
  formId: string
): void {
  try {
    storage.removeItem(storageKey(formId));
  } catch {
    // Draft recovery is best-effort when browser storage is unavailable.
  }
}
