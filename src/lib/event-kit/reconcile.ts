import type { SmartEventKitDraft } from "@/lib/event-kit/draft-builder";
import type { EventKitItem } from "@/lib/event-kit/types";

export type GeneratedItemCreate = SmartEventKitDraft & { sortOrder: number };
export type GeneratedItemUpdate = { id: string; patch: Partial<EventKitItem> };
export type GeneratedReconciliation = { creates: GeneratedItemCreate[]; updates: GeneratedItemUpdate[]; unchanged: number };

function generatedKey(item: EventKitItem) {
  if (typeof item.data.generator_key === "string") return item.data.generator_key;
  if (item.source_type === "rules" && item.item_type === "media" && item.data.interactive_kind === "slideshow") return "auto-slideshow-v1";
  return null;
}
function stable(value: unknown): unknown { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, stable(entry)])); return value; }
function same(a: unknown, b: unknown) { return JSON.stringify(stable(a)) === JSON.stringify(stable(b)); }
function readyPatch(item: EventKitItem, draft: SmartEventKitDraft) {
  const hostCurated = draft.data.generator === "family_feud_v4" && item.data.host_curated === true;
  const runtimeKeys = ["stage", "revealed", "revealed_indexes", "revealed_count", "selected_gem", "gem_visible", "gem_author_visible", "gem_author", "author", "asset_ids", "current_index"];
  const runtime = Object.fromEntries(runtimeKeys.filter((key) => key in item.data).map((key) => [key, item.data[key]]));
  const data = { ...draft.data, ...runtime, ...(hostCurated ? { answers: item.data.answers, host_curated: true } : {}), generator_key: draft.generatorKey, readiness: "ready", readiness_reason: null };
  return { title: draft.title, content: draft.content, item_type: draft.itemType, data, source_refs: draft.sourceRefs, status: "approved" as const, privacy_status: "public_allowed" as const, is_useful: true, do_not_use: false };
}
export function reconcileGeneratedItems(existing: EventKitItem[], drafts: SmartEventKitDraft[]): GeneratedReconciliation {
  const creates: GeneratedItemCreate[] = []; const updates: GeneratedItemUpdate[] = []; let unchanged = 0;
  const readyByKey = new Map(drafts.map((draft) => [draft.generatorKey, draft])); const generated = existing.filter((item) => item.source_type === "rules"); const claimed = new Set<string>(); let nextSort = Math.max(0, ...existing.map((item) => item.sort_order)) + 10;
  for (const item of generated) {
    const key = generatedKey(item); const draft = key && !claimed.has(key) ? readyByKey.get(key) : undefined;
    if (draft) { claimed.add(key!); const patch = readyPatch(item, draft); const current = Object.fromEntries(Object.keys(patch).map((field) => [field, item[field as keyof EventKitItem]])); if (same(current, patch)) unchanged += 1; else updates.push({ id: item.id, patch }); continue; }
    if (!key || !(["who_said_v3", "family_feud_v4"].includes(String(item.data.generator)) || key === "auto-slideshow-v1")) continue;
    const reason = item.data.generator === "who_said_v3" ? "needs_photo" : "source_not_ready";
    const patch = { data: { ...item.data, readiness: "needs_attention", readiness_reason: reason, revealed: false, author: undefined, asset_ids: undefined }, status: "draft" as const, privacy_status: "host_only" as const, is_useful: false, do_not_use: true };
    if (item.status === patch.status && item.privacy_status === patch.privacy_status && item.is_useful === patch.is_useful && item.do_not_use === patch.do_not_use && same(item.data, patch.data)) unchanged += 1; else updates.push({ id: item.id, patch });
  }
  for (const draft of drafts) if (!claimed.has(draft.generatorKey)) { creates.push({ ...draft, sortOrder: nextSort }); nextSort += 10; }
  return { creates, updates, unchanged };
}
