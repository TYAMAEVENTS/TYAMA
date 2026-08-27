"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccessToken, requireUser } from "@/lib/auth/session";
import { getEvent } from "@/lib/events/data";
import { buildSmartEventKitDrafts } from "@/lib/event-kit/draft-builder";
import { EVENT_KIT_TYPES, type EventKitItem, type EventKitType } from "@/lib/event-kit/types";
import { listEventSubmissions } from "@/lib/responses/data";
import { supabaseRest } from "@/lib/supabase/rest";

const PRIVACY = ["host_only", "review_required", "public_allowed"] as const;
const STATUSES = ["draft", "approved", "rejected", "used"] as const;

export type MediaEventKitState = {
  success?: boolean;
  alreadyExists?: boolean;
  error?: string;
};

export type BuildEventKitState = {
  success?: boolean;
  created?: number;
  skipped?: number;
  error?: string;
};

export type AnswerEventKitState = {
  success?: boolean;
  alreadyExists?: boolean;
  error?: string;
};

async function hostContext(eventId: string) {
  const user = await requireUser();
  const accessToken = await getAccessToken();
  if (!accessToken) redirect("/login");
  const event = await getEvent(eventId);
  if (!event || event.host_id !== user.id) throw new Error("Event not found");
  return { user, accessToken };
}

export async function createEventKitItemAction(eventId: string, formData: FormData) {
  const { user, accessToken } = await hostContext(eventId);
  const title = String(formData.get("title") ?? "").trim().slice(0, 300);
  const content = String(formData.get("content") ?? "").trim().slice(0, 20000);
  const typeValue = String(formData.get("type") ?? "note");
  const itemType = EVENT_KIT_TYPES.includes(typeValue as EventKitType) ? typeValue : "note";
  if (!title && !content) redirect(`/events/${eventId}/event-kit?error=empty`);
  const last = await supabaseRest<Array<Pick<EventKitItem, "sort_order">>>(
    `event_kit_items?select=sort_order&event_id=eq.${eventId}&order=sort_order.desc&limit=1`,
    { accessToken },
  );
  await supabaseRest("event_kit_items", {
    method: "POST",
    accessToken,
    body: JSON.stringify({
      host_id: user.id,
      event_id: eventId,
      source_type: "manual",
      item_type: itemType,
      title: title || null,
      content: content || null,
      status: "draft",
      privacy_status: "host_only",
      sort_order: (last[0]?.sort_order ?? 0) + 10,
    }),
  });
  revalidatePath(`/events/${eventId}/event-kit`);
}

export async function buildEventKitDraftsAction(
  eventId: string,
  _previousState: BuildEventKitState,
  _formData: FormData,
): Promise<BuildEventKitState> {
  void _previousState;
  void _formData;
  const { user, accessToken } = await hostContext(eventId);
  try {
    const [submissions, existing, last] = await Promise.all([
      listEventSubmissions(eventId),
      supabaseRest<Array<Pick<EventKitItem, "data">>>(
        `event_kit_items?select=data&event_id=eq.${eventId}`,
        { accessToken },
      ),
      supabaseRest<Array<Pick<EventKitItem, "sort_order">>>(
        `event_kit_items?select=sort_order&event_id=eq.${eventId}&order=sort_order.desc&limit=1`,
        { accessToken },
      ),
    ]);
    const drafts = buildSmartEventKitDrafts(submissions);
    if (!drafts.length) return { error: "Ще немає відповідей, з яких можна зібрати Event Kit." };
    const existingKeys = new Set(existing.flatMap((item) => typeof item.data.generator_key === "string" ? [item.data.generator_key] : []));
    const missing = drafts.filter((draft) => !existingKeys.has(draft.generatorKey));
    if (missing.length) {
      const firstSortOrder = (last[0]?.sort_order ?? 0) + 10;
      await supabaseRest("event_kit_items", {
        method: "POST",
        accessToken,
        body: JSON.stringify(missing.map((draft, index) => ({
          host_id: user.id,
          event_id: eventId,
          source_type: "ai",
          item_type: draft.itemType,
          title: draft.title,
          content: draft.content,
          data: { ...draft.data, generator_key: draft.generatorKey },
          source_refs: draft.sourceRefs,
          status: "draft",
          privacy_status: "host_only",
          sort_order: firstSortOrder + index * 10,
        }))),
      });
    }
    revalidatePath(`/events/${eventId}/event-kit`);
    return { success: true, created: missing.length, skipped: drafts.length - missing.length };
  } catch {
    return { error: "Не вдалося зібрати чернетки. Raw answers і ручний Event Kit залишилися без змін." };
  }
}

export async function createEventKitItemFromAnswerAction(
  eventId: string,
  answerId: string,
  _previousState: AnswerEventKitState,
  _formData: FormData,
): Promise<AnswerEventKitState> {
  void _previousState;
  void _formData;
  const { user, accessToken } = await hostContext(eventId);
  try {
    const [answers, existing] = await Promise.all([
      supabaseRest<Array<{ id: string; answer_text: string | null; answer_json: unknown; question: { prompt: string } | null }>>(
        `answers?select=id,answer_text,answer_json,question:questions(prompt)&id=eq.${answerId}&event_id=eq.${eventId}&limit=1`,
        { accessToken },
      ),
      supabaseRest<Array<{ source_refs: Array<{ type?: string; id?: string }> | null }>>(
        `event_kit_items?select=source_refs&event_id=eq.${eventId}`,
        { accessToken },
      ),
    ]);
    const answer = answers[0];
    if (!answer) return { error: "Відповідь не знайдено." };
    if (existing.some((item) => item.source_refs?.some((ref) => ref.type === "answer" && ref.id === answer.id))) {
      return { success: true, alreadyExists: true };
    }
    const content = answer.answer_text ?? JSON.stringify(answer.answer_json);
    await supabaseRest("event_kit_items", {
      method: "POST",
      accessToken,
      body: JSON.stringify({
        host_id: user.id,
        event_id: eventId,
        source_type: "manual",
        item_type: "story",
        title: answer.question?.prompt || "Відповідь респондента",
        content,
        source_refs: [{ type: "answer", id: answer.id }],
        status: "draft",
        privacy_status: "host_only",
      }),
    });
    revalidatePath(`/events/${eventId}/event-kit`);
    revalidatePath(`/events/${eventId}/responses`);
    return { success: true };
  } catch {
    return { error: "Не вдалося додати відповідь у Event Kit." };
  }
}

export async function createEventKitItemFromMediaAction(
  eventId: string,
  assetId: string,
  _previousState: MediaEventKitState,
  _formData: FormData,
): Promise<MediaEventKitState> {
  void _previousState;
  void _formData;
  const { user, accessToken } = await hostContext(eventId);
  try {
    const assets = await supabaseRest<Array<{ id: string; kind: string; original_filename: string | null; privacy_status: string; moderation_status: string }>>(
      `media_assets?select=id,kind,original_filename,privacy_status,moderation_status&id=eq.${assetId}&event_id=eq.${eventId}&status=eq.ready&limit=1`,
      { accessToken },
    );
    const asset = assets[0];
    if (!asset) return { error: "Медіафайл не знайдено." };
    const existing = await supabaseRest<Array<{ source_refs: Array<{ type?: string; id?: string }> | null }>>(
      `event_kit_items?select=source_refs&event_id=eq.${eventId}&item_type=eq.media`,
      { accessToken },
    );
    if (existing.some((item) => item.source_refs?.some((ref) => ref.type === "media_asset" && ref.id === asset.id))) {
      return { success: true, alreadyExists: true };
    }
    await supabaseRest("event_kit_items", {
      method: "POST",
      accessToken,
      body: JSON.stringify({
        host_id: user.id,
        event_id: eventId,
        source_type: "manual",
        item_type: "media",
        title: asset.original_filename || `${asset.kind} з анкети`,
        content: "Медіа з відповіді. Перевірте privacy та moderation перед показом.",
        source_refs: [{ type: "media_asset", id: asset.id }],
        status: "draft",
        privacy_status: "host_only",
      }),
    });
    revalidatePath(`/events/${eventId}/event-kit`);
    revalidatePath(`/events/${eventId}/responses`);
    return { success: true };
  } catch {
    return { error: "Не вдалося додати медіа в Event Kit." };
  }
}

export async function updateEventKitItemAction(eventId: string, itemId: string, formData: FormData) {
  const { accessToken } = await hostContext(eventId);
  const title = String(formData.get("title") ?? "").trim().slice(0, 300);
  const content = String(formData.get("content") ?? "").trim().slice(0, 20000);
  const statusValue = String(formData.get("status") ?? "draft");
  const privacyValue = String(formData.get("privacy") ?? "host_only");
  const status = STATUSES.includes(statusValue as (typeof STATUSES)[number]) ? statusValue : "draft";
  const privacy = PRIVACY.includes(privacyValue as (typeof PRIVACY)[number]) ? privacyValue : "host_only";
  if (!title && !content) redirect(`/events/${eventId}/event-kit?error=empty`);
  await supabaseRest(`event_kit_items?id=eq.${itemId}&event_id=eq.${eventId}`, {
    method: "PATCH",
    accessToken,
    body: JSON.stringify({
      title: title || null,
      content: content || null,
      status,
      privacy_status: privacy,
      is_useful: formData.get("isUseful") === "on",
      do_not_use: formData.get("doNotUse") === "on",
    }),
  });
  revalidatePath(`/events/${eventId}/event-kit`);
}
