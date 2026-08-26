"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccessToken, requireUser } from "@/lib/auth/session";
import { getEvent } from "@/lib/events/data";
import { EVENT_KIT_TYPES, type EventKitItem, type EventKitType } from "@/lib/event-kit/types";
import { supabaseRest } from "@/lib/supabase/rest";

const PRIVACY = ["host_only", "review_required", "public_allowed"] as const;
const STATUSES = ["draft", "approved", "rejected", "used"] as const;

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

export async function createEventKitItemFromAnswerAction(eventId: string, answerId: string) {
  const { user, accessToken } = await hostContext(eventId);
  const answers = await supabaseRest<Array<{ id: string; answer_text: string | null; answer_json: unknown; question: { prompt: string } | null }>>(
    `answers?select=id,answer_text,answer_json,question:questions(prompt)&id=eq.${answerId}&event_id=eq.${eventId}&limit=1`,
    { accessToken },
  );
  const answer = answers[0];
  if (!answer) return;
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
